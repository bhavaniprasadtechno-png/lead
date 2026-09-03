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
              <Link key={c.id} href={`/campaigns/${c.id}`} className="card p-5 block hover:border-brand-300">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{c.name}</h3>
                  <span className="badge bg-slate-100 text-slate-600">{c.status}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{c.goal ?? "No goal set"}</p>
                <p className="text-xs text-slate-400 mt-2">{c.sequences.length} sequence(s)</p>
              </Link>
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
