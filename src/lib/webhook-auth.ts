import { prisma } from "@/lib/db";
import { verifySignature } from "@/lib/hmac";
import { ApiError } from "@/lib/api";
import crypto from "crypto";

/**
 * Verifies an inbound machine-to-machine request from n8n. Every agent
 * workflow signs its callback with N8N_WEBHOOK_SECRET the same way the app
 * signs its outbound webhooks (see src/lib/n8n.ts), so this is symmetric.
 *
 * Also enforces idempotency by default: a request replayed with the same
 * signature is logged once and only processed once. This matters for
 * mutating requests (POST/PATCH), where n8n's automatic retryOnFail resends
 * the exact same signed request (same timestamp, same signature) if the
 * first attempt's response is lost -- e.g. mid Render free-tier cold start,
 * or simply a slow response the client gave up on even though the server
 * finished the write -- and without this guard that retry would
 * double-apply the mutation.
 *
 * A replay is reported back as `{ duplicate: true }` rather than thrown as
 * an error: the retry is expected, harmless (the work was already done on
 * the first attempt), and n8n has no way to tell "this failed" apart from
 * "this succeeded but got reported as a failure" -- confirmed live, this
 * turned a real, successful send into a reported execution failure. Every
 * caller must check `duplicate` and skip re-applying its mutation (and any
 * side effects, like re-triggering a chained n8n webhook) when it's true,
 * returning a plain success response instead.
 *
 * Pass `skipDedupe: true` for read-only GET handlers: replaying a read has
 * no side effects, so there's nothing to protect against, and enforcing
 * dedupe there actively breaks retries -- a retried GET whose first
 * response got lost would otherwise be rejected as "already processed"
 * instead of getting the data it asked for, turning a transient cold-start
 * hiccup into a hard failure.
 */
export async function requireN8nSignature(
  req: Request,
  rawBody: string,
  options?: { skipDedupe?: boolean },
): Promise<{ duplicate: boolean }> {
  const secret = process.env.N8N_WEBHOOK_SECRET;
  if (!secret) {
    throw new ApiError("Webhook secret not configured", 500);
  }

  const signature = req.headers.get("x-signature");
  const timestampHeader = req.headers.get("x-timestamp");

  if (!signature || !timestampHeader) {
    throw new ApiError("Missing signature headers", 401);
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp)) {
    throw new ApiError("Invalid timestamp header", 401);
  }

  const result = verifySignature({ secret, rawBody, timestamp, signature });
  if (!result.valid) {
    throw new ApiError(`Invalid webhook signature (${result.reason})`, 401);
  }

  if (options?.skipDedupe) return { duplicate: false };

  const dedupeKey = crypto.createHash("sha256").update(`${signature}.${timestamp}`).digest("hex");
  const existing = await prisma.webhookInboundLog.findUnique({ where: { dedupeKey } });
  if (existing?.processed) {
    return { duplicate: true };
  }

  await prisma.webhookInboundLog.upsert({
    where: { dedupeKey },
    create: { source: "n8n", dedupeKey, payload: safeJson(rawBody), processed: true },
    update: { processed: true },
  });
  return { duplicate: false };
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { raw };
  }
}
