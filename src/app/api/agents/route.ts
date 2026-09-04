import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["enricher", "scorer", "writer", "classifier", "scheduler", "orchestrator", "housekeeping", "prospector"]),
  systemPrompt: z.string().min(1),
  model: z.string().default("nvidia/nemotron-3-ultra-550b-a55b:free"),
  config: z.record(z.string(), z.any()).optional(),
});

export async function GET() {
  try {
    const session = await requireOrgSession();
    const agents = await prisma.agent.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "asc" },
      include: { _count: { select: { runs: true } } },
    });
    return json({ agents });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireOrgSession();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const agent = await prisma.agent.create({
      data: { orgId: session.orgId, ...parsed.data },
    });
    return json({ agent }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
