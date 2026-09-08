"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";

interface Approval {
  id: string;
  input: any;
  output: any;
  createdAt: string;
  agent: { id: string; name: string; type: string };
  lead: { id: string; firstName: string; lastName: string | null; email: string | null } | null;
}

export default function ApprovalsPage() {
  const [approvals, setApprovals] = useState<Approval[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/approvals");
    const data = await res.json();
    setApprovals(data.approvals ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function decide(id: string, decision: "approved" | "rejected") {
    setApprovals((prev) => prev.filter((a) => a.id !== id));
    await fetch(`/api/approvals/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision }),
    });
  }

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="AI-drafted replies touching pricing, legal, or low-confidence intent wait here before sending"
      />
      <div className="p-8">
        {approvals.length === 0 ? (
          <EmptyState title="Nothing pending" subtitle="AI drafts requiring human review will show up here." />
        ) : (
          <div className="space-y-4">
            {approvals.map((a) => (
              <div key={a.id} className="card p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <span className="badge bg-amber-100 text-amber-700">{a.agent.type}</span>{" "}
                    <span className="text-sm text-slate-500 ml-1">{a.agent.name}</span>
                  </div>
                  <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
                {a.lead && (
                  <Link href={`/leads/${a.lead.id}`} className="text-sm font-medium hover:text-brand-600">
                    {a.lead.firstName} {a.lead.lastName} · {a.lead.email}
                  </Link>
                )}
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1">Input</div>
                    <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto max-h-48">{JSON.stringify(a.input, null, 2)}</pre>
                  </div>
                  <div>
                    <div className="text-xs font-medium text-slate-500 mb-1">AI-drafted output</div>
                    <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto max-h-48">{JSON.stringify(a.output, null, 2)}</pre>
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button className="btn-danger" onClick={() => decide(a.id, "rejected")}>
                    Reject
                  </button>
                  <button className="btn-primary" onClick={() => decide(a.id, "approved")}>
                    Approve &amp; send
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
