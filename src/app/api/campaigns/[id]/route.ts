import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  goal: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({
      where: { id, orgId: session.orgId },
      include: { sequences: { include: { enrollments: { include: { lead: true } } } } },
    });
    if (!campaign) throw new ApiError("Campaign not found", 404);
    return json({ campaign });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.campaign.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("Campaign not found", 404);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const campaign = await prisma.campaign.update({ where: { id }, data: parsed.data });
    return json({ campaign });
  } catch (err) {
    return handleApiError(err);
  }
}
