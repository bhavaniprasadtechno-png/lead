# LeadPilot — AI-Powered Lead Generation & Management Platform

Captures leads from multiple channels, uses AI (Claude) to enrich, score,
and qualify them, and runs autonomous n8n "agents" to nurture leads via
personalized email sequences until they convert or disqualify — with
humans stepping in only at high-value decision points (meeting booked,
objection handling, pricing questions).

**Core principle:** this app (Next.js + PostgreSQL) is the **system of
record and control plane**. n8n is the **execution/orchestration layer**
for AI agents and third-party integrations. They talk exclusively through
authenticated, HMAC-signed REST/webhooks — never a shared database.

```
┌─────────────┐      REST/Webhooks      ┌──────────────┐      API calls      ┌─────────────┐
│   Web App    │◄───────────────────────►│     n8n      │◄───────────────────►│  Claude API  │
│ (Next.js)    │                          │ (Agent Layer)│                     │  / Email /   │
│  + Postgres  │                          │              │                     │  Enrichment  │
└─────────────┘                          └──────────────┘                     └─────────────┘
```

## What's in this repo

- **`src/app`** — Next.js 14 App Router app: the dashboard UI (leads,
  pipeline, campaigns, agents, approvals) *and* the backend REST API
  (`src/app/api/**/route.ts`) in one deployable unit.
- **`prisma/schema.prisma`** — the full data model: organizations, users,
  leads, enrichment, campaigns/sequences, activities, email logs, agent
  configs/runs, integrations, and the inbound webhook audit log.
- **`n8n-workflows/`** — seven importable n8n workflow JSON files, one per
  agent (enrichment, scoring, email personalization, reply classification,
  scheduling, drip orchestration, housekeeping), plus a README explaining
  the webhook contract.
- **`docker-compose.yml`** — local infra: Postgres, Redis, n8n, and the web
  app.

## Agents

| # | Agent | Trigger | What it does |
|---|---|---|---|
| 1 | Lead Enrichment | `lead.created` webhook | Apollo/Clearbit lookup → normalizes → `PATCH /leads/:id/enrichment` |
| 2 | Lead Scoring & Qualification | `lead.enriched` webhook | Claude scores 0–100 with reasoning → `PATCH /leads/:id` (app auto-qualifies at ≥60) |
| 3 | Email Personalization & Sender | `lead.qualified` webhook / sequence step due | Claude drafts subject+body from lead + template → sends → logs activity |
| 4 | Reply Intent Classifier | Gmail/Graph trigger | Matches thread → lead, classifies intent, routes (interested/objection/lost/etc.) |
| 5 | Meeting Scheduler | chained from Agent 4 | Proposes a booking link, updates lead to `meeting_booked` |
| 6 | Sequence / Drip Orchestrator | cron (30 min) | Polls due sequence steps, decides whether to advance, triggers Agent 3 |
| 7 | Data Sync / Housekeeping | cron (nightly) | Summarizes bounces/unsubscribes/funnel into a Slack digest |

Every agent's **system prompt lives in the database** (`agents.system_prompt`,
editable from the **AI Agents** page in the app UI) — n8n fetches it at
the start of every run via `GET /api/agents/by-type/:type`, so prompts can
be tuned without redeploying any workflow.

## Human-in-the-loop

Any agent output flagged `requires_human_review` (pricing/legal replies,
low-confidence intent classification) is written as an `agent_runs` row
with `status = needs_review` instead of being auto-sent. It shows up in
the app's **Approvals** queue; a rep approves or rejects before anything
goes out.

## Security

- Every app↔n8n request is HMAC-SHA256 signed: `signature =
  HMAC(secret, "${timestamp}.${rawBody}")`, sent as `x-signature` /
  `x-timestamp` headers, rejected if older than 5 minutes (replay
  protection). See `src/lib/hmac.ts` and `src/lib/webhook-auth.ts`.
- Every inbound machine call is logged to `webhooks_inbound_log` with a
  dedupe key before processing, so retries are idempotent.
- Sessions are httpOnly, signed JWTs (`src/lib/auth.ts`); passwords are
  bcrypt-hashed.

## Getting started

### 1. Database

Either run Postgres locally:

```bash
docker compose up -d postgres redis n8n
```

...or point at a hosted **Supabase** Postgres instance instead — no code
changes needed, this app talks to it exactly like any other Postgres
database via Prisma:

1. In the Supabase dashboard: **Settings → Database → Connection string →
   URI** (the *direct* connection, not the pooler — Prisma's migration
   engine needs a direct connection). Copy it and fill in your database
   password (**Settings → Database → Reset database password** if you
   don't have it — this is separate from the `sb_publishable_…` /
   `sb_secret_…` API keys, which this app doesn't use since it talks to
   Postgres directly rather than through Supabase's Data API/Auth).
2. Set `DATABASE_URL` in `.env` to that string, appending `?sslmode=require`.
3. Run the migration + seed steps below as normal.

> Supabase's Postgres is reachable only from environments with outbound
> network access to `*.supabase.co` — some sandboxed/CI environments
> restrict this by policy. If `npx prisma migrate deploy` can't reach it,
> either run these steps from a machine with normal internet access, or
> paste the contents of `prisma/migrations/*/migration.sql` into
> Supabase's **SQL Editor** to create the tables directly, then run
> `npm run db:seed` from wherever `DATABASE_URL` is reachable.

### 2. Configure env

```bash
cp .env.example .env
# generate secrets:
openssl rand -base64 32   # → AUTH_SECRET
openssl rand -base64 32   # → N8N_WEBHOOK_SECRET
```

### 3. Install, migrate, seed

```bash
npm install
npm run db:migrate   # creates tables (use `npx prisma migrate deploy` against an existing DB, e.g. Supabase)
npm run db:seed      # demo org + agents + sample leads/campaigns
```

Seeded login: `demo@leadpilot.ai` / `demo12345`

### 4. Run the app

```bash
npm run dev
```

Visit http://localhost:3000.

### 5. Wire up n8n

Import the workflows in `n8n-workflows/` into your n8n instance (see
`n8n-workflows/README.md` for the exact steps, required credentials, and
the full webhook contract table), set `APP_BASE_URL` and
`N8N_WEBHOOK_SECRET` to match this app's `.env`, and connect your Claude,
Apollo/Clearbit, Postmark/SES, Gmail, and Cal.com credentials in n8n's
credential store.

### 6. Deploy (Render)

`render.yaml` at the repo root is a [Render
Blueprint](https://render.com/docs/blueprint-spec) that deploys the app as
a single Docker web service (build/run steps come from `Dockerfile`, so
behavior matches local `docker compose` exactly):

1. Render dashboard → **New → Blueprint** → select this repo/branch.
   Render reads `render.yaml` automatically and creates the service.
2. On the service's **Environment** tab, fill in the variables the
   blueprint deliberately leaves blank (`sync: false` — secrets aren't
   committed to git): `DATABASE_URL` (your Supabase or other Postgres
   connection string), `N8N_WEBHOOK_BASE_URL`, `N8N_WEBHOOK_SECRET`.
   `AUTH_SECRET` is auto-generated by Render.
3. Deploy. `Dockerfile`'s start command runs `prisma migrate deploy`
   before `next start`, so the schema is applied automatically on first
   boot — no separate migration step needed against the deployed DB.
4. Once live, take the Render-assigned URL (e.g.
   `https://leadpilot-web.onrender.com`) and set it as `APP_BASE_URL` in
   n8n — this is what lets n8n workflows call back into the app's API.
   It's the missing piece for n8n Cloud, which can't reach a local or
   sandboxed dev instance.

The `free` plan is set by default — no card/payment needed to deploy. Its
tradeoff: the service spins down after 15 min idle, so the next request
(an n8n webhook call included) pays a ~30-60s cold-start instead of
failing outright. Switch to `starter` later in the blueprint or dashboard
if that latency becomes a problem.

## Database schema

See `prisma/schema.prisma` for the authoritative model. Highlights:

- `leads` / `lead_enrichment` — the core record and its firmographic data
- `campaigns` / `sequences` / `sequence_enrollments` — drip campaign
  definitions and per-lead progress
- `activities` — append-only timeline, the source of truth for what any
  agent or human did to a lead
- `agents` / `agent_runs` — agent configuration (including the tunable
  system prompt) and every execution's input/output/latency/status
- `integrations` / `webhooks_inbound_log` — connection status for external
  providers and the signed-webhook audit trail

## Roadmap (from the original architecture plan)

1. ✅ Foundation — schema, auth, lead CRUD, dashboard, webhook infra
2. ✅ Agents 1 & 2 — enrichment + scoring, visible on lead detail
3. ✅ Agent 3 — email personalization + sending, template management
4. ✅ Agents 4 & 5 — reply classification, scheduler, approval queue
5. ✅ Sequences — drip orchestrator, pipeline Kanban, campaign builder
6. ✅ Analytics — funnel dashboard, agent activity, approvals
7. ⬜ Hardening — retry/idempotency load testing, BullMQ queue workers for
   outbound webhook delivery, production secrets vault, CAN-SPAM/GDPR
   suppression-list enforcement at send time
