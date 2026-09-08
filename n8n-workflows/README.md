# n8n Agent Workflows

This directory contains importable n8n workflow definitions for the eight
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
n8n import:workflow --input=n8n-workflows/08-icp-lead-prospector.json
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
| `GOOGLE_AI_API_KEY` | Your [Google AI Studio](https://aistudio.google.com/apikey) API key — sent as `Authorization: Bearer {{$vars.GOOGLE_AI_API_KEY}}` on every "Call LLM" node, against Google's OpenAI-compatible endpoint. Not an n8n credential — just a Variable, same pattern as everything else on this page. | every workflow's LLM call |
| `SEND_ENABLED` | `true` or `false` — gates Agent 3's outbound send behind a feature flag until deliverability is validated | Agent 3 |
| `ORG_ID` | Your org's UUID from the `organizations` table (single-tenant simplification — see notes in Agent 6/7) | Agents 6, 7 |
| `CAL_COM_BOOKING_LINK` | Your Cal.com booking URL, e.g. `https://cal.com/your-team/intro` (falls back to a placeholder if unset) | Agent 5 |
| `SERPER_API_KEY` | Your [Serper](https://serper.dev) API key — sent as `X-API-KEY` to `google.serper.dev/search` so Agent 8 can ground candidates in real search results instead of the LLM's training data | Agent 8 |
| `HUNTER_API_KEY` | Your [Hunter.io](https://hunter.io) API key — sent as the `api_key` query param to `api.hunter.io/v2/email-finder` so Agent 8 can find a real email for a candidate by company + name (free tier: 25 searches/month) | Agent 8 |

Separately, in n8n's **credential store** (Settings → Credentials, not
Variables — these are actual API keys, kept out of both `$vars` and the
workflow JSON):

| Credential | Used for |
|---|---|
| Apollo/Clearbit API | Agent 1 (enrichment) |
| Postmark/SES | Agent 3 (sending) |
| Gmail/Microsoft Graph | Agent 4 (reply capture) |
| Cal.com / Google Calendar | Agent 5 (scheduling) |

Every LLM call goes through Google AI Studio's OpenAI-compatible
`/chat/completions` API instead of a dedicated n8n credential type —
see **The LLM call shape** below.

### The LLM call shape (Google AI Studio, OpenAI-compatible)

Every "Call LLM" node in these workflows is the same shape:

```
POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
Authorization: Bearer {{$vars.GOOGLE_AI_API_KEY}}
content-type: application/json

{
  "model": "<agent.model from the app, e.g. gemini-2.5-flash>",
  "max_tokens": <N>,
  "reasoning_effort": "none",
  "messages": [
    { "role": "system", "content": "<agent.systemPrompt from the app>" },
    { "role": "user", "content": "<JSON-stringified context>" }
  ]
}
```

Google AI Studio (the Gemini API) exposes an OpenAI-compatible endpoint
that accepts this exact request shape and returns this exact response
shape, which is why swapping providers here only meant changing each "Call
LLM" node's `url` and `Authorization` header — nothing about the rest of
the body changed. This differs from Anthropic's Messages API in two ways
worth knowing if you swap models again later: the system prompt is a
`role: "system"` message inside the `messages` array (not a separate
top-level `system` field), and the model's answer comes back as a plain
string at `response.choices[0].message.content` (not a `content` block
array).

Every current Gemini model (2.5+) does "thinking" by default, which
consumes `max_tokens` on invisible reasoning before any visible output —
at the small `max_tokens` budgets these agents use (256–1024), that was
enough to return an empty/truncated response with nothing to parse.
`reasoning_effort: "none"` disables it. Separately, Gemini tends to wrap
JSON replies in ` ```json ... ``` ` fences even when the system prompt
demands strict JSON, so every "Parse ... JSON" Code node strips a leading/
trailing fence (`text.trim().replace(/^```(?:json)?\s*|\s*```$/g, '')`)
before `JSON.parse()`s it, rather than trusting any one provider's
formatting compliance — every agent's system prompt still ends with a
strict-JSON output instruction, this is just a second line of defense.

Change the model for any agent from the app's **AI Agents** page (per-org,
no redeploy needed) — pick any Gemini [model
id](https://ai.google.dev/gemini-api/docs/models) Google AI Studio serves
through that same OpenAI-compatible endpoint, not just the Gemini 2.5
Flash default. Agent 8 (Prospector) is the one exception to "just an LLM call":
since Google's OpenAI-compatible endpoint has no hosted web search tool
(unlike Claude), a **Build Search Query** Code node and a **Serper: Web
Search** HTTP node run before its "Call LLM" node, and the LLM's user
message includes those real search results (title/link/snippet) alongside
the ICP — see `08-icp-lead-prospector.json` and the "AI-driven lead
discovery" section below.

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
| `icp.discover` | 08-icp-lead-prospector | `icp.discover` |

`icp.discover` is fired by `POST /api/icp-profiles/:id/discover`, which a
user triggers from the app's **ICP** page (or you call directly) — it's
not tied to any lead lifecycle event, it starts a fresh web search run.

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
| `GET /api/icp-profiles/:id` | Agent 8 — fetch ICP criteria to search against |
| `POST /api/icp-profiles/:id/runs/:runId/results` | Agent 8 — report discovered candidates back |

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
- Agent 4's Gmail trigger polls the entire shared inbox, so it also fires
  on emails that aren't lead replies at all (tool notifications,
  newsletters, etc.). `GET Lead by Thread` uses `neverError` so the app's
  expected 404 for those doesn't fail the run, and an **IF: Lead Found**
  gate right after it skips anything that isn't a tracked lead thread —
  only real lead replies reach the classifier LLM.
- Agent 8 never fabricates contact info, but every candidate it returns
  becomes a `Lead` row (`source = ai_discovery`) and shows up on the
  **Leads** page — with or without a real email — so nothing a search
  finds is hidden from the app; the full candidate list is also kept on
  `LeadDiscoveryRun.candidates` for audit. It grounds candidates in real
  Serper search results across the **complete web** — not restricted to
  any one site — pulling 20 results per run (see the note above); most of
  those pages still won't surface an email directly, so after the LLM
  extracts candidates, a **Hunter: Email Finder** step looks up a real
  email per candidate by company + name (skipped when the candidate has
  no company to search against) and only accepts Hunter's own
  high-confidence result (score ≥ 50). Candidates with no company, or
  where Hunter can't find a confident match, are still imported as leads
  — they just show "No email on file" in the app and skip the auto-send
  step in Agent 3 (`IF: Has Email` gates drafting/sending on a real
  address being present) until someone manually adds contact info.
  Requires the `HUNTER_API_KEY` n8n Variable above.
