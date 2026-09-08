"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader, ScoreBadge } from "@/components/ui";
import { PIPELINE_STAGES } from "@/lib/constants";

interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;
  company: string | null;
  status: string;
  score: number | null;
}

const STAGE_LABELS: Record<string, string> = {
  new: "New",
  qualified: "Qualified",
  contacted: "Contacted",
  engaged: "Engaged",
  meeting_booked: "Meeting Booked",
  won: "Won",
};

export default function PipelinePage() {
  const [leads, setLeads] = useState<Lead[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data.leads ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function move(leadId: string, status: string) {
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, status } : l)));
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(leadId: string) {
    if (!confirm("Delete this lead? This removes its activity, enrichment, and sequence history too.")) return;
    setLeads((prev) => prev.filter((l) => l.id !== leadId));
    await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
  }

  return (
    <div>
      <PageHeader title="Pipeline" subtitle="Move leads through the funnel — advance a card to change its stage" />
      <div className="p-8 overflow-x-auto">
        <div className="flex gap-4 min-w-max">
          {PIPELINE_STAGES.map((stage, idx) => {
            const stageLeads = leads.filter((l) => l.status === stage);
            const nextStage = PIPELINE_STAGES[idx + 1];
            return (
              <div key={stage} className="w-72 shrink-0">
                <div className="flex items-center justify-between mb-3 px-1">
                  <h3 className="font-semibold text-sm text-slate-700">{STAGE_LABELS[stage]}</h3>
                  <span className="text-xs text-slate-400">{stageLeads.length}</span>
                </div>
                <div className="space-y-2">
                  {stageLeads.map((lead) => (
                    <div key={lead.id} className="card p-3">
                      <div className="flex items-center justify-between">
                        <Link href={`/leads/${lead.id}`} className="font-medium text-sm hover:text-brand-600">
                          {lead.firstName} {lead.lastName}
                        </Link>
                        <button
                          className="text-xs text-slate-300 hover:text-red-600"
                          title="Delete lead"
                          onClick={() => remove(lead.id)}
                        >
                          ✕
                        </button>
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5">{lead.company ?? "—"}</div>
                      <div className="flex items-center justify-between mt-2">
                        <ScoreBadge score={lead.score} />
                        {nextStage && (
                          <button
                            className="text-xs text-brand-600 font-medium hover:underline"
                            onClick={() => move(lead.id, nextStage)}
                          >
                            Move to {STAGE_LABELS[nextStage]} →
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                  {stageLeads.length === 0 && <p className="text-xs text-slate-300 px-1">No leads</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
