import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";

/**
 * GET /api/leads/by-thread/:threadId
 * Used by the n8n Reply Intent Classifier Agent (Agent 4) to match an
 * inbound email reply's thread ID back to the originating lead via
 * email_logs.thread_id. HMAC-signed, machine-to-machine.
 */
export async function GET(req: Request, { params }: { params: Promise<{ threadId: string }> }) {
  try {
    await requireN8nSignature(req, "", { skipDedupe: true });
    const { threadId } = await params;

    const emailLog = await prisma.emailLog.findFirst({
      where: { threadId },
      orderBy: { sentAt: "desc" },
      include: { lead: { include: { enrichment: true } } },
    });
    if (!emailLog) throw new ApiError("No lead found for this thread", 404);

    return json({ lead: emailLog.lead, orgId: emailLog.lead.orgId });
  } catch (err) {
    return handleApiError(err);
  }
}
