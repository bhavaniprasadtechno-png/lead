import { signPayload } from "@/lib/hmac";

/**
 * Fires an HMAC-signed webhook from the app to n8n so an agent workflow can
 * pick up the event. The app never calls n8n synchronously for anything
 * user-facing — this is fire-and-forget; n8n reports results back via the
 * REST API (see src/app/api/leads, /activities, /agents/[id]/runs).
 */
export type N8nEvent =
  | "lead.created"
  | "lead.enriched"
  | "lead.qualified"
  | "sequence.step_due"
  | "email.replied";

export async function triggerN8nWebhook(event: N8nEvent, payload: Record<string, unknown>) {
  const baseUrl = process.env.N8N_WEBHOOK_BASE_URL;
  const secret = process.env.N8N_WEBHOOK_SECRET;

  if (!baseUrl || !secret) {
    console.warn(`[n8n] skipping ${event} — N8N_WEBHOOK_BASE_URL/SECRET not configured`);
    return { skipped: true as const };
  }

  const body = JSON.stringify({ event, payload, idempotencyKey: crypto.randomUUID() });
  const timestamp = Date.now();
  const signature = signPayload(secret, body, timestamp);

  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, "")}/webhook/${event}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-signature": signature,
        "x-timestamp": String(timestamp),
      },
      body,
    });
    return { skipped: false as const, ok: res.ok, status: res.status };
  } catch (err) {
    console.error(`[n8n] failed to trigger ${event}`, err);
    return { skipped: false as const, ok: false, error: String(err) };
  }
}
