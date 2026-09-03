import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  systemPrompt: z.string().min(1).optional(),
  model: z.string().optional(),
  isActive: z.boolean().optional(),
  config: z.record(z.string(), z.any()).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const agent = await prisma.agent.findFirst({
      where: { id, orgId: session.orgId },
      include: { runs: { orderBy: { createdAt: "desc" }, take: 50 } },
    });
    if (!agent) throw new ApiError("Agent not found", 404);
    return json({ agent });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.agent.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("Agent not found", 404);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }

    const agent = await prisma.agent.update({ where: { id }, data: parsed.data });
    return json({ agent });
  } catch (err) {
    return handleApiError(err);
  }
}
