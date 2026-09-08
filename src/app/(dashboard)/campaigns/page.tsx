"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  sequences: { id: string }[];
}

const STATUS_OPTIONS = ["draft", "active", "paused", "archived"];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, status } : c)));
    await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function remove(id: string) {
    if (!confirm("Delete this campaign and all its sequences? This can't be undone.")) return;
    setCampaigns((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
  }

  return (
    <div>
      <PageHeader
        title="Campaigns"
        subtitle="Group sequences by goal — n8n's drip orchestrator advances leads through each sequence's steps"
        actions={
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + New campaign
          </button>
        }
      />
      <div className="p-8">
        {campaigns.length === 0 ? (
          <EmptyState title="No campaigns yet" subtitle="Create one to start building sequences." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {campaigns.map((c) => (
              <div key={c.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <Link href={`/campaigns/${c.id}`} className="font-semibold hover:text-brand-600">
                    {c.name}
                  </Link>
                  <select
                    className={`badge cursor-pointer border-0 ${
                      c.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                    value={c.status}
                    onChange={(e) => setStatus(c.id, e.target.value)}
                  >
                    {STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-sm text-slate-500 mt-1">{c.goal ?? "No goal set"}</p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-slate-400">{c.sequences.length} sequence(s)</p>
                  <button className="text-xs text-red-600 font-medium hover:underline" onClick={() => remove(c.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {showModal && <NewCampaignModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}

function NewCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch("/api/campaigns", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, goal, status: "draft" }),
    });
    setSaving(false);
    onCreated();
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="font-semibold text-lg mb-4">New campaign</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Goal</label>
            <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Book demos with mid-market SaaS ops leads" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
