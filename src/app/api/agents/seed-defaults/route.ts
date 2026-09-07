import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";
import { DEFAULT_AGENT_PROMPTS } from "@/lib/constants";

/**
 * POST /api/agents/seed-defaults
 * Creates any agent types the org doesn't already have, using the same
 * defaults as prisma/seed.ts. Idempotent — safe to call repeatedly. Exists
 * because registration only started auto-seeding agents after this route
 * was added; orgs created before that fix have no agents until this runs.
 */
export async function POST() {
  try {
    const session = await requireOrgSession();

    const existing = await prisma.agent.findMany({
      where: { orgId: session.orgId },
      select: { type: true },
    });
    const existingTypes = new Set(existing.map((a) => a.type));

    const created = [];
    for (const def of Object.values(DEFAULT_AGENT_PROMPTS)) {
      if (existingTypes.has(def.type as any)) continue;
      const agent = await prisma.agent.create({
        data: {
          orgId: session.orgId,
          name: def.name,
          type: def.type as any,
          systemPrompt: def.prompt,
          model: "nvidia/nemotron-3-ultra-550b-a55b:free",
          isActive: true,
        },
      });
      created.push(agent);
    }

    return json({ created: created.length, agents: created });
  } catch (err) {
    return handleApiError(err);
  }
}
