"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader } from "@/components/ui";

interface Run {
  id: string;
  status: string;
  createdAt: string;
  latencyMs: number | null;
  input: unknown;
  output: unknown;
}

interface Agent {
  id: string;
  name: string;
  type: string;
  model: string;
  systemPrompt: string;
  isActive: boolean;
  runs: Run[];
}

export default function AgentDetailPage() {
  const params = useParams<{ id: string }>();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/agents/${params.id}`);
    const data = await res.json();
    setAgent(data.agent ?? null);
    setPrompt(data.agent?.systemPrompt ?? "");
    setModel(data.agent?.model ?? "");
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setSaved(false);
    await fetch(`/api/agents/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ systemPrompt: prompt, model }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!agent) return null;

  return (
    <div>
      <PageHeader title={agent.name} subtitle={`Type: ${agent.type}`} />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">System prompt</h2>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save"}
              </button>
            </div>
            <textarea
              className="input font-mono text-xs"
              rows={20}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-2">
              n8n fetches this prompt at the start of every run via <code>GET /api/agents/by-type/{agent.type}</code> — edits here take effect on the next run with no workflow redeploy.
            </p>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Recent runs</h2>
            <div className="space-y-3">
              {agent.runs.length === 0 && <p className="text-sm text-slate-400">No runs logged yet.</p>}
              {agent.runs.map((run) => (
                <details key={run.id} className="text-sm border border-slate-100 rounded-lg p-3">
                  <summary className="cursor-pointer flex items-center justify-between">
                    <span className={`badge ${run.status === "success" ? "bg-emerald-100 text-emerald-700" : run.status === "needs_review" ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"}`}>
                      {run.status}
                    </span>
                    <span className="text-xs text-slate-400">{new Date(run.createdAt).toLocaleString()}</span>
                  </summary>
                  <div className="mt-2 space-y-2">
                    <div>
                      <div className="text-xs font-medium text-slate-500">Input</div>
                      <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto">{JSON.stringify(run.input, null, 2)}</pre>
                    </div>
                    <div>
                      <div className="text-xs font-medium text-slate-500">Output</div>
                      <pre className="text-xs bg-slate-50 rounded p-2 overflow-x-auto">{JSON.stringify(run.output, null, 2)}</pre>
                    </div>
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>

        <div className="card p-6 h-fit">
          <h2 className="font-semibold mb-4">Configuration</h2>
          <div className="space-y-3 text-sm">
            <div>
              <label className="label">Model</label>
              <input className="input" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-slate-500">Status</span>
              <span className="font-medium">{agent.isActive ? "Active" : "Paused"}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
