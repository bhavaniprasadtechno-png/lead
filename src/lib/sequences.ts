import { prisma } from "@/lib/db";
import { ApiError } from "@/lib/api";

interface SequenceStep {
  order: number;
  delayHours: number;
  templateId: string;
  condition?: string;
}

function firstStepDueAt(steps: unknown): Date {
  const list = Array.isArray(steps) ? (steps as SequenceStep[]) : [];
  const first = [...list].sort((a, b) => a.order - b.order)[0];
  const delayHours = first?.delayHours ?? 0;
  return new Date(Date.now() + delayHours * 60 * 60 * 1000);
}

/**
 * Enrolls a lead into a sequence — the write that was missing entirely
 * before: without a SequenceEnrollment row, Agent 6 (GET /api/sequences/due)
 * has nothing to poll and a campaign can never actually send anything.
 * Idempotent: a lead already actively enrolled in this sequence is left
 * alone rather than double-enrolled.
 */
export async function enrollLeadInSequence(sequenceId: string, leadId: string) {
  const sequence = await prisma.sequence.findUnique({ where: { id: sequenceId } });
  if (!sequence) throw new ApiError("Sequence not found", 404);

  const existing = await prisma.sequenceEnrollment.findFirst({
    where: { sequenceId, leadId, completedAt: null, stoppedReason: null },
  });
  if (existing) return existing;

  const enrollment = await prisma.sequenceEnrollment.create({
    data: {
      sequenceId,
      leadId,
      currentStep: 0,
      nextStepDueAt: firstStepDueAt(sequence.steps),
    },
  });

  await prisma.activity.create({
    data: {
      leadId,
      type: "note",
      actor: "human",
      payload: { note: `Enrolled in sequence "${sequence.name}"`, sequenceId, enrollmentId: enrollment.id },
    },
  });

  return enrollment;
}

/**
 * Auto-enrolls a newly-qualified lead into every active campaign's
 * lead_qualified-triggered sequence in its org. Sequences with a
 * "manual" or "form_submission" trigger are never auto-enrolled — those
 * are started explicitly (see enrollLeadInSequence above).
 */
export async function autoEnrollQualifiedLead(leadId: string, orgId: string) {
  const sequences = await prisma.sequence.findMany({
    where: {
      triggerType: "lead_qualified",
      campaign: { orgId, status: "active" },
    },
  });

  for (const sequence of sequences) {
    await enrollLeadInSequence(sequence.id, leadId);
  }

  return sequences.length;
}
