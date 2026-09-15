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
 * first attempt's response is lost -- e.g. mid Render free-tier cold start
 * -- and without this guard that retry would double-apply the mutation.
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
) {
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

  if (options?.skipDedupe) return;

  const dedupeKey = crypto.createHash("sha256").update(`${signature}.${timestamp}`).digest("hex");
  const existing = await prisma.webhookInboundLog.findUnique({ where: { dedupeKey } });
  if (existing?.processed) {
    throw new ApiError("Duplicate request already processed", 409);
  }

  await prisma.webhookInboundLog.upsert({
    where: { dedupeKey },
    create: { source: "n8n", dedupeKey, payload: safeJson(rawBody), processed: true },
    update: { processed: true },
  });
}

function safeJson(raw: string) {
  try {
    return JSON.parse(raw || "{}");
  } catch {
    return { raw };
  }
}
