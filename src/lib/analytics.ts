import { prisma } from "@/lib/db";

export async function getOrgOverview(orgId: string) {
  const [statusCounts, totalLeads, avgScoreResult, emailsSent, replies, meetingsBooked, agentRuns, pendingApprovals] =
    await Promise.all([
      prisma.lead.groupBy({ by: ["status"], where: { orgId }, _count: true }),
      prisma.lead.count({ where: { orgId } }),
      prisma.lead.aggregate({ where: { orgId, score: { not: null } }, _avg: { score: true } }),
      prisma.activity.count({ where: { type: "email_sent", lead: { orgId } } }),
      prisma.activity.count({ where: { type: "email_replied", lead: { orgId } } }),
      prisma.activity.count({ where: { type: "meeting_booked", lead: { orgId } } }),
      prisma.agentRun.count({ where: { agent: { orgId } } }),
      prisma.agentRun.count({ where: { agent: { orgId }, status: "needs_review", reviewedAt: null } }),
    ]);

  const funnel = statusCounts.reduce<Record<string, number>>((acc, row) => {
    acc[row.status] = row._count;
    return acc;
  }, {});

  return {
    totalLeads,
    avgScore: avgScoreResult._avg.score ? Math.round(avgScoreResult._avg.score) : null,
    funnel,
    emailsSent,
    replies,
    replyRate: emailsSent > 0 ? Math.round((replies / emailsSent) * 1000) / 10 : 0,
    meetingsBooked,
    agentRuns,
    pendingApprovals,
  };
}
