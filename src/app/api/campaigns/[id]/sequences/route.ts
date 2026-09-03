import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";

const stepSchema = z.object({
  order: z.number().int().min(0),
  delayHours: z.number().int().min(0),
  templateId: z.string().uuid(),
  condition: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1),
  triggerType: z.enum(["lead_qualified", "manual", "form_submission"]).default("lead_qualified"),
  steps: z.array(stepSchema).min(1),
});

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({ where: { id, orgId: session.orgId } });
    if (!campaign) throw new ApiError("Campaign not found", 404);

    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }

    const sequence = await prisma.sequence.create({
      data: {
        campaignId: id,
        name: parsed.data.name,
        triggerType: parsed.data.triggerType,
        steps: parsed.data.steps,
      },
    });

    return json({ sequence }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
