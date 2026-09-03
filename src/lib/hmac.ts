import crypto from "crypto";

const MAX_SKEW_MS = 5 * 60 * 1000; // 5 minutes replay protection window

/**
 * Signs a payload the same way for both directions of the app<->n8n
 * webhook contract: signature = HMAC_SHA256(secret, `${timestamp}.${rawBody}`).
 */
export function signPayload(secret: string, rawBody: string, timestamp: number) {
  return crypto
    .createHmac("sha256", secret)
    .update(`${timestamp}.${rawBody}`)
    .digest("hex");
}

export function verifySignature(params: {
  secret: string;
  rawBody: string;
  timestamp: number;
  signature: string;
}) {
  const { secret, rawBody, timestamp, signature } = params;

  if (Math.abs(Date.now() - timestamp) > MAX_SKEW_MS) {
    return { valid: false, reason: "stale_timestamp" as const };
  }

  const expected = signPayload(secret, rawBody, timestamp);
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");

  if (expectedBuf.length !== actualBuf.length || !crypto.timingSafeEqual(expectedBuf, actualBuf)) {
    return { valid: false, reason: "bad_signature" as const };
  }

  return { valid: true as const };
}
