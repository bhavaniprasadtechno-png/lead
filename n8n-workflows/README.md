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
| `TAVILY_API_KEY` | Your [Tavily](https://tavily.com) API key (free tier: 1,000 searches/month, no card) — sent in the JSON body to `api.tavily.com/search` so Agent 8 can ground candidates in real search results instead of the LLM's training data. Tavily takes plain natural-language queries, unlike Google-operator-based search APIs | Agent 8 |
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
  "model": "<agent.model from the app, e.g. gemini-3.5-flash-lite>",
  "max_tokens": <N>,
  "messages": [
    { "role": "system", "content": "<agent.systemPrompt from the app>" },
    { "role": "user", "content": "<JSON-stringified context>" }
  ]
}
```

Every "Call LLM" node builds its body as a single JSON expression
(`specifyBody: "json"`) rather than a plain keypair body, so the model
name can be swapped in dynamically per-org.

Google AI Studio exposes an OpenAI-compatible endpoint that accepts this
exact request shape and returns this exact response shape, which is why
swapping providers here only meant changing each "Call LLM" node's `url`
and `Authorization` header — nothing about the rest of the body changed.
This differs from Anthropic's Messages API in two ways worth knowing if
you swap models again later: the system prompt is a `role: "system"`
message inside the `messages` array (not a separate top-level `system`
field), and the model's answer comes back as a plain string at
`response.choices[0].message.content` (not a `content` block array).

**No `reasoning_effort` param is sent, on purpose.** Earlier revisions of
these workflows sent `reasoning_effort: "none"` to disable Gemini's
default "thinking" behavior (which otherwise burns `max_tokens` on
invisible reasoning before any visible output, at the small budgets these
agents use). That worked on `gemini-2.5-flash`, but every model tried
since — `gemma-4-31b-it` (`400: Thinking budget is not supported for this
model`) and `gemini-3.5-flash-lite` (`400: Request contains an invalid
argument`) — rejects the param outright. Since it's not universally safe,
no "Call LLM" node sends it at all; `gemini-3.5-flash-lite` (the current
default) doesn't need it — it does not emit hidden reasoning tokens the
way `gemini-2.5-flash`/`gemma-4-31b-it` did, so omitting the param is
sufficient rather than a workaround. Separately, every model here tends to
wrap JSON replies in ` ```json ... ``` ` fences even when the system
prompt demands strict JSON, so every "Parse ... JSON" Code node strips a
leading/trailing fence (`text.trim().replace(/^```(?:json)?\s*|\s*```$/g,
'')`) before `JSON.parse()`s it, rather than trusting any one provider's
formatting compliance — every agent's system prompt still ends with a
strict-JSON output instruction, this is just a second line of defense.
Every "Parse ... JSON" node also strips a `<thought>...</thought>` block
before that fence-stripping — a no-op for `gemini-3.5-flash-lite`, but
needed if an org switches an agent to a Gemma model, which prepends its
full reasoning as literal `<thought>` text and can consume the entire
`max_tokens` budget doing so (every "Call LLM" node floors `max_tokens` at
4096 when it detects a Gemma model, `/^gemma/i.test(model)`, to leave room
for both the reasoning and the answer).

**Known history, in case a similar issue resurfaces:** `gemma-4-31b-it`
(tried first) had three separate reliability problems in production
beyond the `reasoning_effort` rejection above — it also hit a hard
16,000-token free-tier **input** quota that a single ICP search (long
prompt + 20 search results) could exceed outright, and returned a hard
`500 Internal error` from Google in roughly half of live test runs during
development. `gemini-2.5-flash-lite` (tried next) turned out to be fully
deprecated (`404: ... no longer available to new users`), with Google's
own error message recommending `gemini-3.5-flash-lite` — the model
that's now the default, verified reliable (clean JSON, ~750ms latency,
no quota issues) across multiple live test runs. Every "Call LLM" node
still has `retryOnFail` (3 tries, 2s apart) as a safety net regardless of
model.

Change the model for any agent from the app's **AI Agents** page (per-org,
no redeploy needed) — pick any Gemini or Gemma [model
id](https://ai.google.dev/gemini-api/docs/models) Google AI Studio serves
through that same OpenAI-compatible endpoint. Agent 8 (Prospector) is the one exception to "just an LLM call":
since Google's OpenAI-compatible endpoint has no hosted web search tool
(unlike Claude), a **Build Search Query** Code node and a **Tavily: Web
Search** HTTP node run before its "Call LLM" node, and the LLM's user
message includes those real search results — enriched with a
deterministically-parsed `extractedCompany`/`extractedLocation` per
LinkedIn result, not just the raw title/link/snippet — alongside the ICP.
See `08-icp-lead-prospector.json` and the "AI-driven lead discovery"
section below for why that enrichment step exists.

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
- **Agent 1's Apollo lookup has no real credential by default, and that's
  handled, not a bug to fix before things work.** Without a real
  Apollo/Clearbit credential, `Apollo: Company/Contact Lookup` gets back
  `{"error": "Api key required"}` — `neverError` on that node stops that
  from killing the run, and `Normalize Enrichment (LLM)` detects the
  response isn't real Apollo data (no `person`/`organization` field) and
  sends the LLM an empty object instead, which its existing prompt already
  handles correctly ("only pass through fields present in the source
  payload" → all nulls). The lead still gets PATCHed and still moves on to
  scoring. Wire in a real Apollo/Clearbit credential to get actual
  firmographic data instead of nulls.
- **A lead's score was never actually being written, in any setup.**
  Agent 2 PATCHes a lead's score to `/api/leads/:id` using the same
  HMAC-signature auth every other n8n→app call uses — but that route only
  checked `requireOrgSession()` (a login cookie), so every one of those
  PATCHes 401'd silently before this was fixed. This was an app bug, not a
  workflow one (`PATCH /api/leads/:id` only branched on a session cookie,
  unlike `GET /api/leads/:id` in the same file which already supported
  both a session and an HMAC signature) — fixed in `src/app/api/leads/[id]/
  route.ts` to accept either, matching the rest of the API. This required
  an app-code change and redeploy to actually take effect, not just an n8n
  edit.
- **`Sign: Log Run` in Agents 1 and 2 was reading fields from the wrong
  node.** Both call a PATCH first (enrichment / score) and *then* build the
  `POST /agents/:id/runs` audit-log payload from `$json` — but by that
  point `$json` is the PATCH response body, which doesn't carry `leadId`
  or `agentId`. The URL ended up as `.../api/agents//runs` (empty agent
  id) → `405`. This didn't block enrichment or scoring (the important
  PATCH already happened earlier in the chain), but it made every
  execution show red and broke the `agent_runs` audit trail. Fixed by
  reading `leadId`/`agentId` from the earlier `Parse LLM JSON` / `Parse
  Score JSON` node instead of `$json`.
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
  Tavily search results, pulling 20 results per run at `search_depth:
  'advanced'` (see the note above).

  **The search query is aimed at finding named people, not products.**
  An earlier version of **Build Search Query** joined every ICP field
  (titles, industries, geographies, *and* technologies/keywords like "3D
  configurator", "AR try-on") into one query. That reliably returned
  **zero candidates** in production: those technology/keyword terms bias
  Tavily toward pages *about the product category* — vendor/marketing
  pages for tools like Zakeke, VisionThree, Zolak — which never name a
  real person, so the prospector LLM (correctly, per its strict
  no-fabrication rules) had nothing to extract. The query now deliberately
  **excludes** technologies/keywords and instead reads like
  `"<titles> at a <industries> company in <geographies> - named on a
  company leadership/team/about page, in a press release, or on their
  LinkedIn profile"` — natural-language phrasing tuned for Tavily's
  semantic ranking, aimed at pages that name a specific person, and
  deliberately not LinkedIn-only in its own wording. Job titles are the
  one field worth setting on every ICP regardless: without them the query
  has nothing pointing at *people* at all.

  **The LLM needs the company pre-extracted, not just the raw snippet —
  and that's not a LinkedIn-only problem.** Even with good search results
  (real LinkedIn profile pages naming real people at real, ICP-matching
  companies), `gemini-3.5-flash-lite` initially still returned zero
  candidates — it wasn't confidently inferring a person's employer from
  unstructured scraped text and, being a "lite" model, gave up rather than
  reason it out (a handful of completion tokens, an empty `candidates`
  array). The fix: **Call LLM (Web Search)** regex-parses an
  `extractedCompany`/`extractedLocation` field directly from each result
  *before* the LLM ever sees it, alongside the raw snippet — shifting the
  hard part (parsing messy scraped text) to deterministic code and leaving
  the LLM with only the judgment call (does this company fit the ICP?).
  For LinkedIn profile URLs this comes from the page's `# Name\nCompany\n
  Location` header; for every other result (company team/leadership/about
  pages, press releases, news articles) it's guessed from the page
  **title** via a few common patterns (`"X - Leadership"`,
  `"Leadership - X"`, `"Name - Title | X"`, `"X - Team"`). Without the
  second half of this, results were skewed almost entirely toward
  LinkedIn even though Tavily was already returning plenty of non-LinkedIn
  company pages — the model just wasn't confident enough to extract from
  them without the same kind of anchor LinkedIn results got. Verified
  live: a real run surfaced a candidate sourced entirely from a **Forbes
  article** (no LinkedIn URL at all) alongside the usual LinkedIn matches.
  None of this needed a system prompt change — a null `jobTitle` was
  already a valid field per the existing prompt's own JSON schema; the
  model just wasn't confident enough to use it without a pre-extracted
  company to point to.

  **Split Out silently nests its output — always normalize after it.**
  Once real candidates started coming back, reporting them to the app
  failed with a `422: Required` from `POST
  /icp-profiles/:id/runs/:runId/results`. n8n's **Split Out Candidates**
  node (`fieldToSplitOut: "candidates"`) doesn't flatten each array
  element to the item's top level — it keeps the element nested under its
  original field name, so a flat `{ firstName, company, ... }` candidate
  becomes `{ candidates: { firstName, company, ... } }` for the rest of
  the branch. That corrupted the final payload (each candidate double-
  wrapped) *and* silently broke **IF: Has Company** — it checks
  `$json.company`, which no longer existed at the top level, so it always
  took the "no company" branch and **Hunter: Email Finder** never actually
  ran on any candidate that had a company, defeating its whole purpose. A
  new **Normalize Split Candidate** node right after Split Out unwraps
  this back to a flat object before anything else touches it. Verified
  live: Hunter now actually fires and returns real, verified emails (not
  just candidates with no company skipping it) and the final report to
  the app succeeds.

  Most matched pages still won't surface an email directly, so after the
  LLM extracts candidates, **Hunter: Email Finder** looks up a real email
  per candidate by company + name (skipped when the candidate has no
  company to search against) and only accepts Hunter's own high-
  confidence result (score ≥ 50). Candidates with no company, or where
  Hunter can't find a confident match, are still imported as leads — they
  just show "No email on file" in the app and skip the auto-send step in
  Agent 3 (`IF: Has Email` gates drafting/sending on a real address being
  present) until someone manually adds contact info. Requires the
  `HUNTER_API_KEY` n8n Variable above.
