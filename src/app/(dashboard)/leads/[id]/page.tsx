import { notFound } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, StatusBadge, ScoreBadge } from "@/components/ui";
import { LeadStatusControl } from "@/components/LeadStatusControl";

export default async function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return null;

  const lead = await prisma.lead.findFirst({
    where: { id, orgId: session.orgId },
    include: {
      enrichment: true,
      owner: true,
      activities: { orderBy: { createdAt: "desc" } },
      emailLogs: { orderBy: { sentAt: "desc" } },
      agentRuns: { orderBy: { createdAt: "desc" }, include: { agent: true } },
    },
  });

  if (!lead) notFound();

  return (
    <div>
      <PageHeader
        title={`${lead.firstName} ${lead.lastName ?? ""}`.trim()}
        subtitle={`${lead.jobTitle ?? "Unknown title"} at ${lead.company ?? "Unknown company"}`}
        actions={<LeadStatusControl leadId={lead.id} status={lead.status} score={lead.score} />}
      />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Overview</h2>
            <dl className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="font-medium">{lead.email ?? "No email on file"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Phone</dt>
                <dd className="font-medium">{lead.phone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Source</dt>
                <dd className="font-medium">{lead.source.replace(/_/g, " ")}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Website</dt>
                <dd className="font-medium">{lead.website ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Status</dt>
                <dd>
                  <StatusBadge status={lead.status} />
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">AI score</dt>
                <dd className="flex items-center gap-2">
                  <ScoreBadge score={lead.score} />
                  {lead.scoreReason && <span className="text-slate-500 text-xs">{lead.scoreReason}</span>}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Enrichment</h2>
            {lead.enrichment ? (
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-slate-500">Company size</dt>
                  <dd className="font-medium">{lead.enrichment.companySize ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Industry</dt>
                  <dd className="font-medium">{lead.enrichment.industry ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Revenue range</dt>
                  <dd className="font-medium">{lead.enrichment.revenueRange ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Technologies</dt>
                  <dd className="font-medium">
                    {Array.isArray(lead.enrichment.technologiesUsed) && lead.enrichment.technologiesUsed.length
                      ? (lead.enrichment.technologiesUsed as string[]).join(", ")
                      : "—"}
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-slate-400">
                Not yet enriched. The n8n Lead Enrichment Agent will populate this once triggered.
              </p>
            )}
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Activity timeline</h2>
            <div className="space-y-4">
              {lead.activities.length === 0 && <p className="text-sm text-slate-400">No activity yet.</p>}
              {lead.activities.map((a) => (
                <div key={a.id} className="flex gap-3 text-sm">
                  <div className="w-2 h-2 mt-1.5 rounded-full bg-brand-400 shrink-0" />
                  <div>
                    <div className="font-medium">
                      {a.type.replace(/_/g, " ")}{" "}
                      <span className="text-slate-400 font-normal">
                        · {a.actor}
                        {a.agentName ? ` (${a.agentName})` : ""}
                      </span>
                    </div>
                    {a.payload !== null && (
                      <pre className="text-xs text-slate-500 mt-1 whitespace-pre-wrap break-words">
                        {JSON.stringify(a.payload, null, 0)}
                      </pre>
                    )}
                    <div className="text-xs text-slate-400 mt-0.5">{new Date(a.createdAt).toLocaleString()}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold mb-4">Agent runs</h2>
            <div className="space-y-3">
              {lead.agentRuns.length === 0 && <p className="text-sm text-slate-400">No agent runs yet.</p>}
              {lead.agentRuns.map((run) => (
                <div key={run.id} className="text-sm border-b border-slate-100 pb-3 last:border-0">
                  <div className="font-medium">{run.agent.name}</div>
                  <div className="text-xs text-slate-400">
                    {run.status} · {new Date(run.createdAt).toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Email log</h2>
            <div className="space-y-3">
              {lead.emailLogs.length === 0 && <p className="text-sm text-slate-400">No emails sent yet.</p>}
              {lead.emailLogs.map((email) => (
                <div key={email.id} className="text-sm border-b border-slate-100 pb-3 last:border-0">
                  <div className="font-medium">{email.subject}</div>
                  <div className="text-xs text-slate-400">{new Date(email.sentAt).toLocaleString()}</div>
                  {email.repliedAt && <div className="text-xs text-emerald-600 mt-1">Replied</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
