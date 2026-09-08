import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { enrollLeadInSequence } from "@/lib/sequences";

const schema = z.object({ sequenceId: z.string().uuid() });

/**
 * POST /api/leads/:id/enroll
 * Manually starts a lead in a sequence — the human-driven counterpart to
 * autoEnrollQualifiedLead, for "manual"-trigger sequences or for re-adding
 * a lead outside the automatic qualified-lead flow.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const lead = await prisma.lead.findFirst({ where: { id, orgId: session.orgId } });
    if (!lead) throw new ApiError("Lead not found", 404);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }

    const sequence = await prisma.sequence.findFirst({
      where: { id: parsed.data.sequenceId, campaign: { orgId: session.orgId } },
    });
    if (!sequence) throw new ApiError("Sequence not found", 404);

    const enrollment = await enrollLeadInSequence(sequence.id, lead.id);
    return json({ enrollment }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
