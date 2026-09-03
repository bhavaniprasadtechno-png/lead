"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/ui";

interface Agent {
  id: string;
  name: string;
  type: string;
  model: string;
  isActive: boolean;
  _count: { runs: number };
}

const TYPE_DESCRIPTIONS: Record<string, string> = {
  enricher: "Looks up firmographic data (Apollo/Clearbit) for new leads",
  scorer: "Scores fit & intent 0–100 and decides qualification",
  writer: "Drafts personalized first-touch and follow-up emails",
  classifier: "Classifies inbound replies and routes by intent",
  scheduler: "Proposes meeting times once a lead is interested",
  orchestrator: "Decides whether a due sequence step should send",
  housekeeping: "Nightly bounce/unsubscribe/dedupe summary",
};

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/agents");
    const data = await res.json();
    setAgents(data.agents ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggle(agent: Agent) {
    setAgents((prev) => prev.map((a) => (a.id === agent.id ? { ...a, isActive: !a.isActive } : a)));
    await fetch(`/api/agents/${agent.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !agent.isActive }),
    });
  }

  return (
    <div>
      <PageHeader
        title="AI Agents"
        subtitle="Each agent is an n8n workflow whose system prompt lives here — tune tone/rules without redeploying workflows"
      />
      <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => (
          <div key={agent.id} className="card p-5">
            <div className="flex items-start justify-between">
              <div>
                <Link href={`/agents/${agent.id}`} className="font-semibold hover:text-brand-600">
                  {agent.name}
                </Link>
                <div className="text-xs text-slate-400 mt-0.5">
                  {agent.type} · {agent.model}
                </div>
              </div>
              <button
                onClick={() => toggle(agent)}
                className={`badge cursor-pointer ${agent.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}
              >
                {agent.isActive ? "Active" : "Paused"}
              </button>
            </div>
            <p className="text-sm text-slate-600 mt-3">{TYPE_DESCRIPTIONS[agent.type]}</p>
            <p className="text-xs text-slate-400 mt-3">{agent._count.runs} run(s) logged</p>
          </div>
        ))}
      </div>
    </div>
  );
}
