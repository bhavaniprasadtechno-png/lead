# LeadPilot — AI-Powered Lead Generation & Management Platform

Captures leads from multiple channels, uses AI (via Google AI Studio —
currently Gemma 3) to enrich, score, and qualify them, and runs
autonomous n8n "agents" to nurture leads via
personalized email sequences until they convert or disqualify — with
humans stepping in only at high-value decision points (meeting booked,
objection handling, pricing questions).

**Core principle:** this app (Next.js + PostgreSQL) is the **system of
record and control plane**. n8n is the **execution/orchestration layer**
for AI agents and third-party integrations. They talk exclusively through
authenticated, HMAC-signed REST/webhooks — never a shared database.

```
┌─────────────┐      REST/Webhooks      ┌──────────────┐      API calls      ┌─────────────┐
│   Web App    │◄───────────────────────►│     n8n      │◄───────────────────►│ Google AI    │
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
| 2 | Lead Scoring & Qualification | `lead.enriched` webhook | The LLM scores 0–100 with reasoning → `PATCH /leads/:id` (app auto-qualifies at ≥60) |
| 3 | Email Personalization & Sender | `lead.qualified` webhook / sequence step due | The LLM drafts subject+body from lead + template → sends → logs activity |
| 4 | Reply Intent Classifier | Gmail/Graph trigger | Matches thread → lead, classifies intent, routes (interested/objection/lost/etc.) |
| 5 | Meeting Scheduler | chained from Agent 4 | Proposes a booking link, updates lead to `meeting_booked` |
| 6 | Sequence / Drip Orchestrator | cron (30 min) | Polls due sequence steps, decides whether to advance, triggers Agent 3 |
| 7 | Data Sync / Housekeeping | cron (nightly) | Summarizes bounces/unsubscribes/funnel into a JSON digest |
| 8 | ICP Lead Prospector | `icp.discover` webhook (user clicks "Run Search Now") | Finds candidates matching a user-defined ICP → reports back → verifiable candidates become leads |

Every "the LLM" above is called through **Google AI Studio**
(`https://generativelanguage.googleapis.com/v1beta/openai/chat/completions`,
OpenAI-compatible), not Anthropic directly — see `n8n-workflows/README.md`
for the exact request shape and the `GOOGLE_AI_API_KEY` Variable every
workflow needs.

### AI-driven lead discovery (ICP Search)

Define an **Ideal Customer Profile** — target industries, company size
range, job titles, geographies, tech stack, and other buying-intent
keywords — on the **ICP Search** page, then click **Run Search Now**.

Agent 8 was originally designed around Claude's hosted web search tool,
which has no Google AI Studio/Gemma equivalent (server-side tools are
provider-specific). It now searches via **Serper** instead: a
**Build Search Query** step turns the ICP's job titles/industries/
geographies/keywords into a `site:linkedin.com/in` search, a
**Serper: Web Search** step runs it, and the LLM extracts/structures
candidates only from those real results (its prompt still forbids
answering from training data alone). Requires a `SERPER_API_KEY` n8n
Variable — see `n8n-workflows/README.md`.

Candidates found (once search is wired back in) are grounded in a real,
cited source — never an invented person, company, or email. Only
candidates where a real email was found become `Lead` records
(`source = ai_discovery`) and re-enter the exact same enrichment →
scoring → outreach pipeline as any other lead; candidates without a
verifiable email are still kept on the run for review, just not
auto-imported. Every run is deduped against existing leads by email
within the org.

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

...or point at a hosted **Supabase** Postgres instance instead — no app
code changes needed beyond the two-URL split below, this app talks to it
like any other Postgres database via Prisma:

1. In the Supabase dashboard: **Settings → Database → Connection string**.
   Use the **pooler** connections, not the *direct* one Supabase shows
   first — the direct host (`db.<ref>.supabase.co`) is IPv6-only and
   unreachable from most hosts, Render included, which surfaces as
   `Error: P1001: Can't reach database server`. Grab both pooler URLs
   (same host, different ports) and fill in your database password
   (**Settings → Database → Reset database password** if you don't have
   it — separate from the `sb_publishable_…`/`sb_secret_…` API keys,
   which this app doesn't use since it talks to Postgres directly rather
   than through Supabase's Data API/Auth):
   - `DATABASE_URL` → **Transaction pooler** (port 6543, add
     `?pgbouncer=true`) — what the running app uses
   - `DIRECT_URL` → **Session pooler** (port 5432) — what
     `prisma migrate deploy` uses; the transaction pooler doesn't support
     the session-level features migrations need
2. Set both in `.env` (see `.env.example` for the exact shape).
3. Run the migration + seed steps below as normal.

> Some sandboxed/CI environments restrict outbound network access by
> policy and can't reach Supabase at all (`*.supabase.co` or
> `*.pooler.supabase.com`). If `npx prisma migrate deploy` can't connect,
> either run these steps from a machine with normal internet access, or
> paste the contents of `prisma/migrations/*/migration.sql` into
> Supabase's **SQL Editor** to create the tables directly, then run
> `npm run db:seed` from wherever the database is reachable.

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
the full webhook contract table), set `APP_BASE_URL`, `N8N_WEBHOOK_SECRET`,
and `GOOGLE_AI_API_KEY` as n8n Variables, and connect your Apollo/Clearbit,
Postmark/SES, Gmail, and Cal.com credentials in n8n's credential store.

### 6. Deploy (Render)

`render.yaml` at the repo root is a [Render
Blueprint](https://render.com/docs/blueprint-spec) that deploys the app as
a single **native Node** web service — not Docker. Render requires a card
on file for Docker-runtime services even on the free plan; native Node
does not, so this is what keeps the deploy card-free. (`Dockerfile` /
`docker-compose.yml` are still there for local dev — Render just doesn't
use them.)

1. Render dashboard → **New → Blueprint** → select this repo/branch.
   Render reads `render.yaml` automatically and creates the service.
2. On the service's **Environment** tab, fill in the variables the
   blueprint deliberately leaves blank (`sync: false` — secrets aren't
   committed to git): `DATABASE_URL` and `DIRECT_URL` (Supabase's
   *pooler* connection strings — see the Database section above; Render
   can't reach Supabase's direct/IPv6 host), `N8N_WEBHOOK_BASE_URL`,
   `N8N_WEBHOOK_SECRET`.
   `AUTH_SECRET` is auto-generated by Render.
3. Deploy. The start command runs `prisma db push` before `next start`,
   so the schema is applied automatically on first boot — no separate
   migration step needed against the deployed DB. (`db push`, not
   `migrate deploy`: Supabase's other schemas — `auth`, `storage`,
   `extensions`, etc. — make `migrate deploy`'s "is this empty?" check
   fail with `P3005` even though `public`, the only schema this app
   uses, is genuinely fresh. `db push` just diffs the schema directly and
   is idempotent, so it's a no-op on every redeploy after the first.)
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
- `icp_profiles` / `lead_discovery_runs` — user-defined Ideal Customer
  Profiles and the Prospector agent's search history against each one
  (full candidate list kept for audit, even candidates not imported)
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
