import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";

const stepSchema = z.object({
  order: z.number().int().min(0),
  delayHours: z.number().int().min(0),
  templateId: z.string().uuid(),
  condition: z.string().optional(),
});

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  triggerType: z.enum(["lead_qualified", "manual", "form_submission"]).optional(),
  steps: z.array(stepSchema).min(1).optional(),
});

async function loadSequence(orgId: string, campaignId: string, sequenceId: string) {
  const sequence = await prisma.sequence.findFirst({
    where: { id: sequenceId, campaignId, campaign: { orgId } },
  });
  if (!sequence) throw new ApiError("Sequence not found", 404);
  return sequence;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; sequenceId: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id, sequenceId } = await params;
    await loadSequence(session.orgId, id, sequenceId);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }

    const sequence = await prisma.sequence.update({ where: { id: sequenceId }, data: parsed.data });
    return json({ sequence });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE cascades to that sequence's enrollments (a lead mid-sequence just stops). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; sequenceId: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id, sequenceId } = await params;
    await loadSequence(session.orgId, id, sequenceId);
    await prisma.sequence.delete({ where: { id: sequenceId } });
    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
