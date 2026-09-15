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
| `APOLLO_API_KEY` | Your [Apollo.io](https://apollo.io) API key — sent as the `api_key` body param to `api.apollo.io/v1/people/match` so Agent 1 can enrich a lead's company/contact data. **Not a credential** — n8n has no built-in Apollo credential type, so it will never show up in the credential-type picker; set it as a plain Variable, exactly like `TAVILY_API_KEY`/`HUNTER_API_KEY` above | Agent 1 |
| `POSTMARK_SERVER_TOKEN` | Your [Postmark](https://postmarkapp.com) Server API Token (Servers → your server → API Tokens) — sent as the `X-Postmark-Server-Token` header on `api.postmarkapp.com/email`. **Not a credential** — same pattern as `TAVILY_API_KEY`/`APOLLO_API_KEY`/etc above, a plain Variable | Agents 3, 5 |
| `POSTMARK_FROM_EMAIL` | The email address every outbound email is sent **from** — must be a [verified Sender Signature](https://postmarkapp.com/support/article/1046-how-do-i-add-a-verified-sender-signature) on your Postmark account, or Postmark rejects the send outright | Agents 3, 5 |

Separately, in n8n's **credential store** (Settings → Credentials, not
Variables — these are actual API keys, kept out of both `$vars` and the
workflow JSON):

| Credential | Used for |
|---|---|
| Gmail/Microsoft Graph | Agent 4 (reply capture) |
| Cal.com / Google Calendar | Agent 5 (scheduling) |

(Postmark is **not** in this list — despite an earlier version of these
workflows referencing a `postmarkApi` predefined credential type, no
Postmark credential was ever actually created in this n8n instance, so
that config silently did nothing. It's now a plain `$vars` Variable pair
above, same as every other third-party API key here — no n8n credential
needed.)

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
  open them in the n8n editor and wire in your real Postmark/Gmail/Cal.com
  credentials — placeholder HTTP Request nodes are included with the
  correct URLs and payload shapes but generic auth.
- **A node calling the app can fail with a raw HTML "Bad gateway"/"Service
  unavailable" page instead of JSON — that's Render's cold-start page, not
  an app bug.** Render's free/starter tier spins the web service down after
  a period of inactivity; the *next* request (any of these workflows' HTTP
  Request nodes hitting `$vars.APP_BASE_URL`) has to wait for it to wake
  back up, and can get Render's own branded error HTML back (a page whose
  body is literally `@font-face` declarations and CSS variables, "Bad
  gateway - the service failed to handle your request" or "Service
  unavailable - try again later") if the node doesn't tolerate the delay.
  This first surfaced on `GET /sequences/due` in Agent 6, then again on
  three nodes in Agent 8 — both got `retryOnFail` (5 tries, 5s apart —
  n8n's per-node maximum) at the time, but every *other* agent's calls
  to the app (Agents 1, 2, 3, 5, and the orchestrator's prompt-fetch in
  Agent 6) had the exact same exposure and had simply not hit it yet: any
  one of them failing mid-run with no retry aborts that entire execution
  (a lead never gets enriched/scored/emailed, a run's audit log entry
  never gets written), indistinguishable from a real failure in the n8n
  UI. **Every HTTP Request node in every workflow that calls
  `$vars.APP_BASE_URL` now has this same `retryOnFail`/5-tries/5s-apart
  hardening**, with one deliberate exception: Agent 4's `GET Lead by
  Thread` already sets `neverError` (needed so an expected 404 for a
  non-lead-reply email doesn't abort the run — see the note on Agent 4's
  Gmail trigger below) — `neverError` means the node never throws on a
  non-2xx response in the first place, so `retryOnFail` would never
  actually trigger there. A cold-start 502 on that specific node degrades
  to "no matching lead found" (the reply is silently skipped rather than
  classified) instead of crashing the run; getting that node to
  distinguish a real 404 from a transient 502 would need restructuring
  the error handling, not just adding a retry flag, so it's left as a
  known gap rather than worked around here. If you see this failure shape
  on a node not covered above (e.g. a new node you add later), the fix is
  the same: add `retryOnFail`/`maxTries: 5`/`waitBetweenTries: 5000` to
  it, or move the app to a Render plan that doesn't spin down.
- **There is no "Apollo" entry in n8n's credential-type picker — that's
  expected, not something to keep searching for.** Apollo.io isn't a
  first-party n8n integration, so it was never going to appear no matter
  what you search when adding a credential. `Apollo: Company/Contact
  Lookup` doesn't use n8n's credential system at all: it sends `api_key`
  as a plain body parameter sourced from the `APOLLO_API_KEY` **Variable**
  (Settings/Overview → Variables in n8n — same place as
  `TAVILY_API_KEY`/`HUNTER_API_KEY`/`GOOGLE_AI_API_KEY`), not a credential.
  Without that Variable set, Apollo returns `{"error": "Api key
  required"}` — `neverError` on that node stops that from killing the
  run, and `Normalize Enrichment (LLM)` detects the response isn't real
  Apollo data (no `person`/`organization` field) and sends the LLM an
  empty object instead, which its existing prompt already handles
  correctly ("only pass through fields present in the source payload" →
  all nulls). The lead still gets PATCHed and still moves on to scoring.
  Set `APOLLO_API_KEY` to get real firmographic data instead of nulls.
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

  **"Emails aren't sending" was two separate, real bugs — not just the
  `SEND_ENABLED` flag being off (which was working as intended).**
  Auditing every recent Agent 3 execution showed all of them (36/36)
  finishing in under 50ms, having done nothing beyond evaluate `IF:
  Sending Enabled` and dead-end on its false branch — confirming
  `$vars.SEND_ENABLED` genuinely wasn't `"true"` in production. That part
  is the deliberate safety gate doing its job, not a bug: this repo
  intentionally ships with sending off until you've validated
  deliverability, per the spec.

  But auditing what happens *if* that flag were flipped on found the
  "Postmark: Send Email" (Agent 3) and "Postmark: Send Booking Email"
  (Agent 5) nodes were never actually wired to a working email provider,
  despite looking configured:
  - Both referenced a `predefinedCredentialType`/`postmarkApi` n8n
    credential — but **no Postmark credential was ever created in this
    n8n instance** (confirmed via the credentials list, count: 0), so
    that config silently did nothing; the request went out with zero
    authentication and Postmark would have rejected it with `401`.
  - Both built their body via `bodyParameters` (n8n's form-encoded/keypair
    body type) while declaring `content-type: application/json` — the
    declared content type and the actual body encoding contradicted each
    other, which Postmark's API would reject regardless of
    authentication. Every other JSON API call in these workflows uses
    `specifyBody: "json"` + a `jsonBody` expression instead; these two
    nodes were the only ones that didn't.
  - Neither ever set a `From` address at all — Postmark requires one, and
    it must be a verified Sender Signature on your account, not an
    arbitrary address.

  Fixed all three the same way in both nodes: a real
  `X-Postmark-Server-Token` header and `From` address, both sourced from
  new `$vars` Variables (`POSTMARK_SERVER_TOKEN`, `POSTMARK_FROM_EMAIL` —
  see the Variables table above) rather than n8n's credential store,
  matching this project's existing convention for every other third-party
  API key. **This alone does not make email sending live** — you still
  need to (1) set those two Variables to real values from a verified
  Postmark account, and (2) deliberately set `SEND_ENABLED` to `"true"`
  once you've confirmed a real test send works end to end. Neither of
  those two steps was done as part of this fix, on purpose: only you can
  supply a real Postmark account, and flipping the send-enabled switch
  for real customer-facing email is a decision this repo leaves to you,
  not something to flip as a side effect of a code fix.

  **Two follow-up refinements to match Postmark's documented API contract
  exactly, on top of the fixes above.** Both nodes now explicitly set
  `MessageStream: 'outbound'` in the request body (Postmark defaults to
  this if omitted, but being explicit avoids surprises if the account's
  default stream is ever changed). More importantly, both are now
  followed by a **Check Postmark Result** node: Postmark's API can return
  HTTP `200` with a non-zero `ErrorCode` in the response body (e.g. an
  inactive/suppressed recipient) — checking HTTP status alone, which is
  all n8n's HTTP Request node does by default, isn't enough to know a
  send actually succeeded. This node reads `ErrorCode`/`Message` from the
  response and throws a clear error if `ErrorCode` isn't `0`, so a
  same-status-but-failed send shows up as a failed execution instead of
  being silently reported to the app as sent. It also captures Postmark's
  own `MessageID` (their delivery-tracking id for bounces/opens) into the
  `email_sent`/`meeting.booked` Activity payload alongside subject/body —
  visible in the campaigns **Emails** tab.
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
- **`Sign: Report Reply` used to send `input.reply` as the literal string
  `'redacted'` and only forward the classifier's structured output**
  (intent/confidence/suggested_reply) to `POST /api/webhooks/inbound` —
  meaning a lead's actual reply text was never persisted anywhere in the
  app, even though it was already available in-workflow (the same
  `replyText` value `Sign: Get Prompt` feeds the classifier LLM). There
  was no way to view what a lead had actually written back, only the AI's
  classification of it. Fixed by forwarding `replyText` in both `input`
  and `output`, so it lands in the `email_replied` Activity's `payload`
  the app already stores and — as of the campaigns "Emails" tab — displays.
  Replies received before this fix has no `replyText` in their payload;
  the UI shows a note rather than fabricating content for those.
- Agent 8 never fabricates contact info, but every candidate it returns
  becomes a `Lead` row (`source = ai_discovery`) and shows up on the
  **Leads** page — with or without a real email — so nothing a search
  finds is hidden from the app; the full candidate list is also kept on
  `LeadDiscoveryRun.candidates` for audit. It grounds candidates in real
  Tavily search results, pulling up to 20 results per job-title query at
  `search_depth: 'advanced'` (see "search per job title" and "fetch the
  maximum" below).

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

  **One blended query only ever covers a fraction of the ICP — search per
  job title instead.** Even after the fixes above, a run would often
  return just one or two candidates despite the ICP listing six job
  titles: **Build Search Query** used to build a single query from only
  the *first three* titles, blended together with the industries into one
  string. One query diluted across several personas at once returns a
  narrower, less relevant result set than the same personas searched
  separately — and any titles past the first three were never searched at
  all. **Build Search Query** now returns one item per job title (capped
  at 10, to keep Tavily usage bounded — free tier is 1,000 searches/month)
  instead of one item total; n8n runs **Tavily: Web Search** once per item
  automatically, and a new **Aggregate Search Results** node merges every
  response back into one deduped pool (by URL) before **Call LLM (Web
  Search)** — which still runs exactly once per ICP run, now against the
  combined results, with its output-token budget raised to 8192 so a
  larger candidate pool isn't truncated. Verified live: with only 2 titles
  populated on the test ICP (the fallback default, `Founder`/`CEO` — the
  real ICP's title list was empty at the time), this alone found 5 real,
  distinct candidates from a single run, versus 1 before.

  **Fetch the maximum: two more volume knobs, plus LinkedIn is explicitly
  optional, not required.** Two follow-up changes, made together:
  - The title cap above went from 6 → 10 and **Tavily: Web Search**'s
    `max_results` per query went from 15 → 20 — both are safe to raise
    together because **Aggregate Search Results** already dedupes the
    combined pool by URL, so a bigger per-query haul doesn't multiply
    duplicate work for the LLM, just real candidate coverage. Worst case
    this is 10 Tavily searches per run instead of 6, so a run now costs
    up to ~1.7x more of the free tier's 1,000 searches/month.
  - The wording in **Build Search Query**'s query tail and in
    `DEFAULT_AGENT_PROMPTS.prospector` (`src/lib/constants.ts`) was
    already functionally an OR across leadership-page / press-release /
    LinkedIn sources (see "The search query is aimed at finding named
    people" above) — nothing in code ever required a LinkedIn URL. But
    since that came up again, both places now spell it out explicitly
    ("LinkedIn is optional, not required" / "a LinkedIn profile is never
    required, it's just one acceptable source among several") so the
    intent isn't just implicit in a permissive OR-phrased sentence.
    Updating `DEFAULT_AGENT_PROMPTS.prospector` only affects newly-seeded
    orgs (`/api/auth/register` and `/api/agents/seed-defaults`) — an
    already-provisioned org's live prospector agent keeps whatever
    `systemPrompt` is stored in its `Agent` row until someone edits it in
    the app's **Agents** settings page (`PATCH /api/agents/:id`, session-
    authenticated only, no n8n/HMAC path).

  **A single transient failure anywhere in the run used to produce zero
  leads, not fewer leads.** Auditing the full flow end-to-end (after the
  fan-out above raised parallel Tavily calls per run from 6 to up to 10)
  found three nodes with no failure tolerance at all, each capable of
  discarding an entire run's worth of real candidates over one blip:
  - **GET Agent Prompt (prospector)**, **GET ICP Profile**, and **POST
    /icp-profiles/:id/runs/:runId/results** had no `retryOnFail` — the
    same Render cold-start failure class documented for `GET
    /sequences/due` in Agent 6 (see that section above) applies equally
    here, and the last of these three is the worst case: hitting a cold
    app *after* search and extraction already succeeded would strand real
    candidates that were found but never got reported, with the
    `LeadDiscoveryRun` stuck at `"queued"` forever. All three now have
    `retryOnFail` (5 tries, 5s apart — n8n's per-node maximum).
  - **Tavily: Web Search** had neither `retryOnFail` nor an `onError`
    override, so it used n8n's default `onError: stopWorkflow`. With the
    fan-out now at up to 10 parallel per-job-title queries, a single
    query hitting a transient network error or momentary rate limit
    didn't just lose that one query's results — n8n's default behavior
    aborted the *entire* workflow execution, discarding the other 9
    queries' results too, before **Call LLM (Web Search)** ever ran.
    Added `retryOnFail` (3 tries, 2s apart, matching the pattern every
    other external-API call in these workflows already uses) plus
    `onError: continueRegularOutput`, so a query that still fails after
    retries just contributes no results for that one title — **Aggregate
    Search Results** already treats a missing/errored `results` field as
    `[]` via its existing fallback, so the run degrades gracefully instead
    of zeroing out.
  - Separately, the "Stop once you have enough distinct, verifiable
    candidates... don't pad the list" line in
    `DEFAULT_AGENT_PROMPTS.prospector` actively told the model to
    self-limit rather than exhaustively extract every real candidate the
    search results supported — directly working against "find as many
    leads as possible". Reworded to extract every distinct, verifiable
    candidate present, while still forbidding padding the list with
    speculative entries just to hit a count. Same
    newly-seeded-orgs-only caveat as above applies to getting this onto
    an already-provisioned org's live agent.

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

  **Every discovery run reported exactly one lead created, no matter how
  many real candidates were actually found — the root cause was
  `Normalize Split Candidate` itself.** It's a Code node with no explicit
  execution mode set, which defaults to "Run Once for All Items," and its
  code used bare `$json` — the same bug class already documented twice
  elsewhere in this workflow (`Enrich Search Results`, `Parse Candidates
  JSON`): in that mode, `$json` silently resolves to only the *first*
  input item, not "the current item." `Split Out Candidates` correctly
  split N real candidates into N items, but `Normalize Split Candidate`
  then threw away all but the first of them, so every node after it (`IF:
  Has Company`, Hunter enrichment, the merge/aggregate steps) only ever
  saw 1 candidate — confirmed on a real production execution where 7
  genuine candidates were found and only 1 (`Mark Agnew`) made it to the
  final report. Fixed the same way as the other two: rewritten to
  `$input.all().map(...)` so every split-out candidate survives. `Apply
  Hunter Result` had the identical risk profile (bare `$input.item` and
  `$('IF: Has Company').item`, also no explicit mode) and was fixed
  pre-emptively the same way, paired by index against `$('IF: Has
  Company').all()`. Verified live: a fresh run correctly carried all 3 of
  that run's real candidates through every downstream step to the final
  payload, where a pre-fix run would have carried only 1.

  If you add a new Code node anywhere in this pipeline that needs to
  touch every item (not just "the first" or "the current"), this is the
  pitfall to know: n8n's default Code node mode makes `$json`/`$input.first()`/
  `$input.item` all silently mean *item zero*, with no error to flag the
  mistake — the fix is always `const items = $input.all(); return
  items.map(...)`.

  **One malformed candidate used to silently strand the entire run.**
  `POST /icp-profiles/:id/runs/:runId/results` validated `candidates` as a
  single Zod array — if the model emitted `""` for a not-found `email`
  instead of the `null` its own prompt asks for (`gemini-3.5-flash-lite`
  does this occasionally), `z.string().email()` rejected that one
  candidate and Zod failed the *whole array*, before the run was ever
  updated. The `LeadDiscoveryRun` stayed at `status: "queued"` forever —
  not `"failed"` (no code path reached the failure branch) — with **zero**
  of that run's real candidates ever becoming leads, and no visible error
  beyond a permanently "queued" badge on the ICP page. Fixed two ways:
  candidate fields are normalized (blank strings and unparseable emails
  become `null`, matching what the schema already expects) before
  validation runs at all, and lead creation now happens per-candidate
  inside a `try/catch` in the results route so one candidate's DB error
  can no longer abort the ones after it — the run always ends up
  `"completed"` with an accurate `leadsCreated`/`leadsSkipped` count.

  Most matched pages still won't surface an email directly, so after the
  LLM extracts candidates, **Hunter: Email Finder** looks up a real email
  per candidate by company + name (skipped when the candidate has no
  company to search against) and only accepts Hunter's own high-
  confidence result (score ≥ 50). Candidates with no company, or where
  Hunter can't find a confident match, are still imported as leads — they
  just show "No email on file" in the app and skip the auto-send step in
  Agent 3 (`IF: Has Email` gates drafting/sending on a real address being
  present) until someone manually adds contact info. Requires the
  `HUNTER_API_KEY` n8n Variable above. Note that Hunter's free tier is a
  much tighter budget than Tavily's (25 lookups/month vs. 1,000 searches)
  — now that a single ICP run can surface many more candidates than
  before, it's easy to burn through Hunter's monthly quota in one or two
  runs. That's expected, not a bug: candidates still get imported as leads
  either way, just without a verified email once the quota's spent for the
  month.

  **Aggregating every job title's search results into one combined pool
  before the LLM call was silently starving it — this was the real cause
  of runs completing with zero candidates.** With the title cap raised to
  10 and 20 results per title, **Aggregate Search Results** could hand
  **Call LLM (Web Search)** a single user message built from up to 200
  search results at once. In production this produced a **~54,795-token
  prompt**, and `gemini-3.5-flash-lite` came back with an empty
  `candidates` array on essentially no completion tokens — the model
  wasn't refusing on the merits, it was choking on the prompt size itself
  (this is well past what a "lite" model reasons over reliably in one
  shot, even with an 8192-token output budget). Every run "completed"
  successfully because nothing actually errored — the LLM call succeeded,
  returned valid (empty) JSON, and the run reported `0 candidates found`
  with no visible failure anywhere in the n8n execution log. This is why
  raising `max_results`/the title cap alone (see "Fetch the maximum"
  above) didn't help and, past a point, actively hurt.

  Fixed by processing each job title's search results as its own
  candidate-extraction call instead of merging everything first:
  - **Aggregate Search Results** was replaced by **Enrich Search
    Results**, which still does the same per-result `extractedCompany`/
    `extractedLocation` parsing (see above) but keeps each job title's
    batch of results as its own separate item instead of flattening every
    batch into one deduped pool.
  - **Call LLM (Web Search)** now reads `$json.query`/`$json.results`
    (the current batch only) instead of a combined pool — n8n's HTTP
    Request node automatically runs once per input item, so this one node
    now makes up to 10 smaller, focused LLM calls per run (one per job
    title) instead of one giant one. Added `onError:
    continueRegularOutput` so one batch's exhausted-retry failure no
    longer takes down the other 9 batches' results (matching the pattern
    already used on **Tavily: Web Search**).
  - **Parse Candidates JSON** now explicitly processes every input item
    (`$input.all().map(...)`) and a new **Merge Query Batches** node
    combines all batches' parsed candidates back into one deduped list
    (by `sourceUrl`+name+company) before the enrichment/reporting nodes
    downstream — restoring the single combined candidate list those nodes
    expect, just built from N small LLM calls instead of one call over
    everything.

  **A general n8n pitfall worth knowing about, hit twice while building
  the fix above:** a Code node's default mode is "Run Once for All Items"
  — but bare `$json` or `$input.first()` inside that mode does not mean
  "the current item," it silently resolves to **only the first input
  item**, discarding the rest with no error. This makes a Code node that
  fans out to N items look like it's processing all of them (no error,
  plausible-looking single output) while actually only ever touching item
  0. Both **Parse Candidates JSON** and (during development) **Enrich
  Search Results** hit this — the fix for a Code node that should act on
  every item is always `const items = $input.all(); return items.map(item
  => ...)`, never bare `$json`/`$input.first()`. HTTP Request nodes don't
  have this problem — they loop per-item automatically — so this only
  matters for Code nodes.

  **Query wording regression:** the "Fetch the maximum" change above
  (spelling out that LinkedIn is optional) had accidentally left
  instructional meta-text — `"found on any of: a company leadership/team/
  about page, a press release, or (optionally, not required) their
  LinkedIn profile"` — as part of the literal Tavily search query string,
  not just the system prompt. That meta-commentary isn't real web content
  and diluted Tavily's semantic relevance ranking for every query.
  **Build Search Query**'s query tail is now the shorter, content-focused
  `"... - leadership team, about us, or press release"`; the fuller
  "LinkedIn is optional" language stays in `DEFAULT_AGENT_PROMPTS.prospector`
  where it belongs (an instruction to the LLM, not a search term).

  Verified live end-to-end via n8n's manual execution tool with a real
  10-job-title ICP: a genuine full run (~92s — a cached/partial run
  finishes in ~15-22s, which is a useful tell if you ever need to confirm
  a test execution actually re-ran every node rather than reusing a stale
  result) correctly fanned out to 10 separate Tavily searches, 10 separate
  Enrich Search Results batches, and 10 separate small LLM calls, each
  returning its own parsed candidates, correctly merged into one deduped
  list by **Merge Query Batches**.

  **Not a bug — a genuine targeting-difficulty finding for narrow ICPs.**
  Even with all of the above fixed, one specific ICP (niche
  e-commerce/merchandising job titles, company size capped at 178
  employees, broad/mixed target industries) still returned zero real
  candidates across all 10 job-title batches in a verified full run. This
  traces to the target itself, not the workflow: very small companies
  rarely publish a public leadership/team page naming someone in a niche
  functional role, so Tavily has little to find, and the prospector LLM
  correctly refuses (per its own strict no-fabrication rules) to guess a
  loosely-related executive is the right person. If an ICP keeps returning
  zero candidates after this fix, check whether it's this shape of
  problem before assuming a workflow bug: try broadening job titles to
  include more common senior fallbacks (e.g. add `Founder`/`CEO`/general
  `Marketing Manager`/`Operations Manager` alongside the niche titles) and/or
  raising the company size ceiling — larger companies are far more likely
  to have a public page naming the specific role you're targeting.
