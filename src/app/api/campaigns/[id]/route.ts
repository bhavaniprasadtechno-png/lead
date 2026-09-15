import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  goal: z.string().nullable().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).optional(),
});

/**
 * Aggregates a campaign's enrollment + engagement results from data that's
 * already been fetched (sequences/enrollments/leads), plus one extra
 * Activity query scoped to those leads — no per-sequence or per-lead N+1s.
 */
async function buildCampaignResults(
  campaign: { sequences: { id: string; name: string; enrollments: { leadId: string; completedAt: Date | null; stoppedReason: string | null }[] }[] },
) {
  const leadIds = Array.from(new Set(campaign.sequences.flatMap((s) => s.enrollments.map((e) => e.leadId))));

  const [activityCounts, recentActivity] = leadIds.length
    ? await Promise.all([
        prisma.activity.groupBy({ by: ["type"], where: { leadId: { in: leadIds } }, _count: true }),
        prisma.activity.findMany({
          where: { leadId: { in: leadIds } },
          orderBy: { createdAt: "desc" },
          take: 30,
          include: { lead: { select: { id: true, firstName: true, lastName: true } } },
        }),
      ])
    : [[], []];

  const countByType = (type: string) => activityCounts.find((c) => c.type === type)?._count ?? 0;
  const emailsSent = countByType("email_sent");
  const opens = countByType("email_opened");
  const replies = countByType("email_replied");
  const meetingsBooked = countByType("meeting_booked");

  const perSequence = campaign.sequences.map((seq) => {
    const completed = seq.enrollments.filter((e) => e.completedAt).length;
    const stopped = seq.enrollments.filter((e) => e.stoppedReason && !e.completedAt).length;
    const active = seq.enrollments.length - completed - stopped;
    return { sequenceId: seq.id, name: seq.name, enrolled: seq.enrollments.length, active, completed, stopped };
  });

  const totals = perSequence.reduce(
    (acc, s) => ({
      totalEnrolled: acc.totalEnrolled + s.enrolled,
      active: acc.active + s.active,
      completed: acc.completed + s.completed,
      stopped: acc.stopped + s.stopped,
    }),
    { totalEnrolled: 0, active: 0, completed: 0, stopped: 0 },
  );

  const stats = {
    ...totals,
    emailsSent,
    opens,
    replies,
    replyRate: emailsSent > 0 ? Math.round((replies / emailsSent) * 1000) / 10 : 0,
    meetingsBooked,
    perSequence,
  };

  return { stats, recentActivity };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const campaign = await prisma.campaign.findFirst({
      where: { id, orgId: session.orgId },
      include: { sequences: { include: { enrollments: { include: { lead: true } } } } },
    });
    if (!campaign) throw new ApiError("Campaign not found", 404);
    const { stats, recentActivity } = await buildCampaignResults(campaign);
    return json({ campaign, stats, recentActivity });
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

/** DELETE /api/campaigns/:id — cascades to its sequences and their enrollments. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.campaign.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("Campaign not found", 404);
    await prisma.campaign.delete({ where: { id } });
    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
