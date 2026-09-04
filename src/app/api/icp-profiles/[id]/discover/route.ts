import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { triggerN8nWebhook } from "@/lib/n8n";

/**
 * POST /api/icp-profiles/:id/discover
 * Starts a new AI-driven lead discovery run: creates a LeadDiscoveryRun
 * (status=queued) and hands off to the n8n Prospector Agent, which
 * searches the web for candidates matching the ICP and reports back via
 * POST /api/icp-profiles/:id/runs/:runId/results.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const icpProfile = await prisma.icpProfile.findFirst({ where: { id, orgId: session.orgId } });
    if (!icpProfile) throw new ApiError("ICP profile not found", 404);

    const run = await prisma.leadDiscoveryRun.create({
      data: {
        icpId: icpProfile.id,
        orgId: session.orgId,
        status: "queued",
        triggeredBy: session.userId,
      },
    });

    const result = await triggerN8nWebhook("icp.discover", {
      icpId: icpProfile.id,
      runId: run.id,
      orgId: session.orgId,
    });

    if (result.skipped || !result.ok) {
      const failedRun = await prisma.leadDiscoveryRun.update({
        where: { id: run.id },
        data: { status: "failed", errorMessage: "Could not reach n8n — check N8N_WEBHOOK_BASE_URL/SECRET", completedAt: new Date() },
      });
      return json({ error: "n8n is not configured or unreachable", run: failedRun }, 502);
    }

    return json({ run }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
