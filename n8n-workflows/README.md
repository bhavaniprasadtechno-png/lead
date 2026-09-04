# n8n Agent Workflows

This directory contains importable n8n workflow definitions for the seven
agents described in the platform architecture. Each workflow is the
**execution/orchestration layer** for one AI agent — the app (Next.js +
Postgres) remains the system of record and control plane. Workflows never
touch Postgres directly; every read/write goes through the app's signed
REST API.

## Import

In n8n: **Workflows → Import from File** and select each `.json` file, or
use the n8n CLI:

```bash
n8n import:workflow --input=n8n-workflows/01-lead-enrichment-agent.json
n8n import:workflow --input=n8n-workflows/02-lead-scoring-agent.json
n8n import:workflow --input=n8n-workflows/03-email-personalization-agent.json
n8n import:workflow --input=n8n-workflows/04-reply-intent-classifier-agent.json
n8n import:workflow --input=n8n-workflows/05-meeting-scheduler-agent.json
n8n import:workflow --input=n8n-workflows/06-sequence-orchestrator.json
n8n import:workflow --input=n8n-workflows/07-housekeeping-agent.json
```

## Required n8n Variables

Every Code/HTTP node below reads `$vars.<NAME>` — n8n's own **Variables**
feature, *not* `$env.<NAME>` (real OS environment variables). This
matters because n8n Cloud gives you no way to set real process env vars;
only self-hosted n8n (where you control the container) can use `$env`.
`$vars` works identically on both, so that's what every workflow uses.

Set these in n8n: left sidebar → **Overview → Variables** (or **Settings
→ Variables**, depending on your n8n version) → **Add Variable**.

| Variable | Value | Required by |
|---|---|---|
| `N8N_WEBHOOK_SECRET` | A secret **you generate** — e.g. `openssl rand -base64 32`. This is not provided by n8n; it's a shared password you invent and set in **both** n8n and the app's `N8N_WEBHOOK_SECRET` env var, byte-for-byte identical. | every workflow (signing/verifying every request) |
| `APP_BASE_URL` | Your deployed app's public URL, e.g. `https://leadpilot-web.onrender.com` (no trailing slash) | every workflow that calls the app's API |
| `SEND_ENABLED` | `true` or `false` — gates Agent 3's outbound send behind a feature flag until deliverability is validated | Agent 3 |
| `ORG_ID` | Your org's UUID from the `organizations` table (single-tenant simplification — see notes in Agent 6/7) | Agents 6, 7 |
| `CAL_COM_BOOKING_LINK` | Your Cal.com booking URL, e.g. `https://cal.com/your-team/intro` (falls back to a placeholder if unset) | Agent 5 |

Separately, in n8n's **credential store** (Settings → Credentials, not
Variables — these are actual API keys, kept out of both `$vars` and the
workflow JSON):

| Credential | Used for |
|---|---|
| Claude API (Anthropic) | Every "Call Claude" HTTP Request node |
| Apollo/Clearbit API | Agent 1 (enrichment) |
| Postmark/SES | Agent 3 (sending) |
| Gmail/Microsoft Graph | Agent 4 (reply capture) |
| Cal.com / Google Calendar | Agent 5 (scheduling) |

## The webhook contract (both directions)

Every request between the app and n8n is HMAC-signed the same way:

```
signature = HMAC_SHA256(N8N_WEBHOOK_SECRET, `${timestamp}.${rawBody}`)
```

sent as headers `x-signature` and `x-timestamp` (unix ms). The receiver
rejects requests older than 5 minutes (replay protection) and logs every
inbound call to `webhooks_inbound_log` for idempotent retries (see
`src/lib/webhook-auth.ts`).

Each workflow's first non-trigger node is a **Code** node named
`Sign Request` that computes this header pair before every HTTP Request
call to the app API, and (for webhook-triggered workflows) a `Verify
Signature` node that re-derives the signature over the inbound body and
compares it to the `x-signature` header using the same secret.

For **GET** requests (no body), sign over an empty string: `rawBody = ""`.

## App → n8n events (this app calls these webhook URLs)

The app builds each URL as `${N8N_WEBHOOK_BASE_URL}/webhook/<event>`
(`src/lib/n8n.ts`). That must match the webhook trigger node's **Path**
field *exactly* — set it to just the event name below, with no extra
prefix (e.g. `lead.enriched`, not `webhook/lead.enriched`).

| Event | Workflow | Webhook node "Path" |
|---|---|---|
| `lead.created` | 01-lead-enrichment-agent | `lead.created` |
| `lead.enriched` | 02-lead-scoring-agent | `lead.enriched` |
| `lead.qualified` | 03-email-personalization-agent | `lead.qualified` |

`email.replied` is fired by the app when a human decides on an item in the
**Approvals** queue (`POST /api/approvals/:id`), but Agent 4 in this repo
is Gmail-trigger-based, not webhook-based — there's no workflow here that
receives it yet. Add a small webhook-triggered workflow (path
`email.replied`) if you want n8n to act on approval decisions instead of
just leaving the app's own DB update as the record.

n8n gives every webhook node **two URLs**: a test one
(`.../webhook-test/<path>`, only fires once, per click of **"Listen for
test event"** in the editor) and a production one (`.../webhook/<path>`,
live once the workflow's **Active** toggle, top-right of the editor, is
on). The app always calls the production URL — a workflow must be
Active for the app's automatic calls to reach it.

## n8n → app endpoints (these workflows call the app's REST API)

| Endpoint | Called by |
|---|---|
| `GET /api/agents/by-type/:type?orgId=` | every workflow, first step — fetches the current system prompt/model so prompt edits in the app UI take effect with no redeploy |
| `GET /api/leads/:id` | Agents 2-5 — pull lead + enrichment context |
| `PATCH /api/leads/:id/enrichment` | Agent 1 |
| `PATCH /api/leads/:id` | Agent 2 (score/status) |
| `POST /api/leads/:id/activities` | all agents — timeline logging |
| `POST /api/agents/:id/runs` | all agents — input/output/latency/cost logging |
| `POST /api/webhooks/inbound` | Agents 3-5 — reply classification, meetings booked, bounces, sequence progression |
| `GET /api/sequences/due?orgId=` | Agent 6, polling |

## Notes

- These JSON files are a faithful **starting point**, not a black box:
  open them in the n8n editor and wire in your real Apollo/Postmark/Gmail/
  Cal.com credentials — placeholder HTTP Request nodes are included with
  the correct URLs and payload shapes but generic auth.
- Every workflow that sends outbound customer email (Agents 3 and 5) is
  built to enforce the daily-send-cap / feature-flag pattern from the spec:
  gate the "Send Email" node behind an `IF` node reading a `SEND_ENABLED`
  environment variable in n8n until deliverability is validated.
- Classifier output with `requires_human_review: true` is written to
  `/api/webhooks/inbound` with `requiresHumanReview: true`, which creates
  an `agent_runs` row with `status = needs_review` — it shows up in the
  app's **Approvals** queue and is never auto-sent.
