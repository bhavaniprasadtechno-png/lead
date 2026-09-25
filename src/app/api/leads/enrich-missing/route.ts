import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";
import { triggerN8nWebhook } from "@/lib/n8n";

const MAX_PER_REQUEST = 25;

/**
 * POST /api/leads/enrich-missing
 * On-demand re-enrichment for leads already sitting in the pipeline with
 * gaps (no name, or no email) — re-fires the same lead.created webhook
 * Agent 1 already handles for brand-new leads, so it re-runs the exact
 * same Apollo/Hunter/Tavily+LLM branches against current data. A lead with
 * no company on file has nothing for any of those branches to search
 * against, so it's excluded and reported separately.
 */
export async function POST() {
  try {
    const session = await requireOrgSession();

    const incompleteWhere = {
      orgId: session.orgId,
      OR: [{ firstName: null }, { email: null }],
    };

    const enrichable = await prisma.lead.findMany({
      where: { ...incompleteWhere, company: { not: null } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
      take: MAX_PER_REQUEST,
    });

    const skippedNoCompany = await prisma.lead.count({
      where: { ...incompleteWhere, company: null },
    });

    await Promise.all(
      enrichable.map((lead) => triggerN8nWebhook("lead.created", { leadId: lead.id, orgId: session.orgId }))
    );

    return json({ queued: enrichable.length, skippedNoCompany });
  } catch (err) {
    return handleApiError(err);
  }
}
