import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";

/**
 * GET /api/sequences/due?orgId=...
 * Polled every ~30 min by the n8n Sequence/Drip Orchestrator (Agent 6).
 * Returns every enrollment whose next step is due, so the workflow can
 * decide (via the orchestrator agent's own Claude call) whether to trigger
 * Agent 3 with the next template. HMAC-signed, machine-to-machine.
 */
export async function GET(req: Request) {
  try {
    await requireN8nSignature(req, "", { skipDedupe: true });

    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) throw new ApiError("orgId query param is required", 422);

    const enrollments = await prisma.sequenceEnrollment.findMany({
      where: {
        completedAt: null,
        stoppedReason: null,
        nextStepDueAt: { lte: new Date() },
        sequence: { campaign: { orgId } },
      },
      include: {
        lead: { include: { enrichment: true } },
        sequence: { include: { campaign: true } },
      },
      take: 200,
    });

    return json({ enrollments });
  } catch (err) {
    return handleApiError(err);
  }
}
