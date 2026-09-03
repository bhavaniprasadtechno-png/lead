import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";

/**
 * GET /api/approvals
 * The human-in-the-loop queue: any agent run flagged needs_review
 * (pricing/legal replies, low-confidence intent classification, objection
 * handling) waits here until a rep approves or rejects it.
 */
export async function GET() {
  try {
    const session = await requireOrgSession();
    const runs = await prisma.agentRun.findMany({
      where: {
        status: "needs_review",
        reviewedAt: null,
        agent: { orgId: session.orgId },
      },
      orderBy: { createdAt: "desc" },
      include: { agent: true, lead: true },
    });
    return json({ approvals: runs });
  } catch (err) {
    return handleApiError(err);
  }
}
