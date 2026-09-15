"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader, EmptyState, StatusBadge, Modal } from "@/components/ui";

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  sequences: { id: string }[];
  totalEnrolled: number;
}

const STATUS_OPTIONS = ["draft", "active", "paused", "archived"];

export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/campaigns");
    const data = await res.json();
    setCampaigns(data.campaigns ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(id: string, status: string) {
    const prev = campaigns;
    setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    const res = await fetch(`/api/campaigns/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) setCampaigns(prev);
  }

  async function remove(id: string) {
    if (!confirm("Delete this campaign, its sequences, and all enrollment history? This can't be undone.")) return;
    const prev = campaigns;
    setCampaigns((cs) => cs.filter((c) => c.id !== id));
    const res = await fetch(`/api/campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) setCampaigns(prev);
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
        {loaded && campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            subtitle="Create one, add a sequence, then set it Active — qualified leads enroll automatically."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {campaigns.map((c) => (
              <div key={c.id} className="card p-5 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <Link href={`/campaigns/${c.id}`} className="font-semibold hover:text-brand-600">
                    {c.name}
                  </Link>
                  <select
                    className="input !w-auto !py-1 text-xs cursor-pointer"
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
                <p className="text-sm text-slate-500 mt-1 flex-1">{c.goal ?? "No goal set"}</p>
                <div className="flex items-center gap-2 mt-3">
                  <StatusBadge status={c.status} />
                  <span className="text-xs text-slate-400">
                    {c.sequences.length} sequence{c.sequences.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100">
                  <p className="text-sm">
                    <span className="font-semibold">{c.totalEnrolled}</span>{" "}
                    <span className="text-slate-500">lead{c.totalEnrolled === 1 ? "" : "s"} enrolled</span>
                  </p>
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
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, goal, status: "draft" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to create campaign");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New campaign" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="label">Name</label>
          <input className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 outbound — mid-market SaaS" />
        </div>
        <div>
          <label className="label">Goal</label>
          <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Book demos with mid-market SaaS ops leads" />
        </div>
        <p className="text-xs text-slate-400">
          Starts as a draft. Add a sequence, then set it Active from the campaign page so qualified leads start enrolling.
        </p>
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
