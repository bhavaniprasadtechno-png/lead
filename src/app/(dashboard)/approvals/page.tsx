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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const res = await fetch("/api/approvals");
    const data = await res.json();
    setApprovals(data.approvals ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // New items land here asynchronously from n8n (a lead reply came in and needed
  // review) with no user action to trigger a reload, so this is a live queue a
  // rep might sit on for a while — poll for new arrivals rather than requiring
  // a manual refresh.
  useEffect(() => {
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  function startEdit(a: Approval) {
    setEditingId(a.id);
    setDrafts((prev) => ({ ...prev, [a.id]: JSON.stringify(a.output, null, 2) }));
    setErrors((prev) => ({ ...prev, [a.id]: "" }));
  }

  async function decide(a: Approval, decision: "approved" | "rejected") {
    let editedOutput: unknown;
    if (editingId === a.id) {
      try {
        editedOutput = JSON.parse(drafts[a.id] ?? "");
      } catch {
        setErrors((prev) => ({ ...prev, [a.id]: "Edited output must be valid JSON" }));
        return;
      }
    }
    setApprovals((prev) => prev.filter((x) => x.id !== a.id));
    try {
      const res = await fetch(`/api/approvals/${a.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ decision, ...(editedOutput !== undefined ? { editedOutput } : {}) }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to record decision");
      }
    } catch (err) {
      // The decision didn't actually go through — put the item back rather than
      // silently dropping it from the queue while the DB still shows it pending.
      setApprovals((prev) => (prev.some((x) => x.id === a.id) ? prev : [...prev, a]));
      setErrors((prev) => ({ ...prev, [a.id]: err instanceof Error ? err.message : "Failed to record decision" }));
    }
  }

  return (
    <div>
      <PageHeader
        title="Approvals"
        subtitle="AI-drafted replies touching pricing, legal, or low-confidence intent wait here — approving sends the reply and/or schedules a meeting; rejecting stands down"
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
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-xs font-medium text-slate-500">AI-drafted output</div>
                      {editingId !== a.id && (
                        <button
                          className="text-xs text-brand-600 font-medium hover:underline"
                          onClick={() => startEdit(a)}
                        >
                          Edit before approving
                        </button>
                      )}
                    </div>
                    {editingId === a.id ? (
                      <textarea
                        className="input font-mono text-xs w-full max-h-48"
                        rows={8}
                        value={drafts[a.id] ?? ""}
                        onChange={(e) => setDrafts((prev) => ({ ...prev, [a.id]: e.target.value }))}
                      />
                    ) : (
                      <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto max-h-48">{JSON.stringify(a.output, null, 2)}</pre>
                    )}
                    {errors[a.id] && <div className="text-xs text-red-600 mt-1">{errors[a.id]}</div>}
                  </div>
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  {editingId === a.id && (
                    <button className="btn-secondary" onClick={() => setEditingId(null)}>
                      Cancel edit
                    </button>
                  )}
                  <button className="btn-danger" onClick={() => decide(a, "rejected")}>
                    Reject
                  </button>
                  <button className="btn-primary" onClick={() => decide(a, "approved")}>
                    Approve
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
