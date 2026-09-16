import Link from "next/link";
import { getSession } from "@/lib/auth";
import { getOrgOverview } from "@/lib/analytics";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge, StatTile } from "@/components/ui";
import { PIPELINE_STAGES } from "@/lib/constants";
import { Stagger, StaggerItem, AnimatedNumber } from "@/components/motion";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) return null;

  const [overview, recentLeads] = await Promise.all([
    getOrgOverview(session.orgId),
    prisma.lead.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
  ]);

  const stats = [
    { label: "Total leads", value: overview.totalLeads },
    { label: "Avg. AI score", value: overview.avgScore ?? "—" },
    { label: "Reply rate", value: `${overview.replyRate}%` },
    { label: "Meetings booked", value: overview.meetingsBooked },
  ];

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Funnel performance and AI agent activity across your organization"
        actions={
          <Link href="/leads" className="btn-primary">
            + Add lead
          </Link>
        }
      />
      <div className="p-8 space-y-8">
        <Stagger className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((s) => (
            <StaggerItem key={s.label}>
              <StatTile label={s.label} value={s.value} />
            </StaggerItem>
          ))}
        </Stagger>

        {overview.pendingApprovals > 0 && (
          <Link
            href="/approvals"
            className="block card card-hover p-4 border-amber-300 bg-amber-50 text-amber-800 text-sm font-medium hover:bg-amber-100"
          >
            ⚠️ {overview.pendingApprovals} AI-drafted response{overview.pendingApprovals === 1 ? "" : "s"} waiting for your review →
          </Link>
        )}

        <div className="card p-6">
          <h2 className="font-semibold mb-4">Pipeline funnel</h2>
          <Stagger className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {PIPELINE_STAGES.map((stage) => (
              <StaggerItem key={stage} className="text-center">
                <div className="text-2xl font-bold text-slate-800">
                  <AnimatedNumber value={overview.funnel[stage] ?? 0} />
                </div>
                <div className="mt-1">
                  <StatusBadge status={stage} />
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="card card-hover p-6">
            <h2 className="font-semibold mb-4">AI agent activity</h2>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Total agent runs</span>
                <span className="font-medium">{overview.agentRuns}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Emails sent by agents</span>
                <span className="font-medium">{overview.emailsSent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Replies received</span>
                <span className="font-medium">{overview.replies}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Pending human review</span>
                <span className="font-medium">{overview.pendingApprovals}</span>
              </div>
            </div>
          </div>

          <div className="card card-hover p-6">
            <h2 className="font-semibold mb-4">Recent leads</h2>
            <div className="divide-y divide-slate-100">
              {recentLeads.length === 0 && <p className="text-sm text-slate-400">No leads yet.</p>}
              {recentLeads.map((lead) => (
                <Link
                  key={lead.id}
                  href={`/leads/${lead.id}`}
                  className="row-hover flex items-center justify-between py-3 text-sm -mx-2 px-2 rounded"
                >
                  <div>
                    <div className="font-medium">
                      {lead.firstName} {lead.lastName}
                    </div>
                    <div className="text-slate-500">{lead.company ?? lead.email}</div>
                  </div>
                  <StatusBadge status={lead.status} />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
