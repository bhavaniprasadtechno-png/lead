"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";

interface IcpProfile {
  id: string;
  name: string;
  description: string | null;
  industries: string[] | null;
  companySizeMin: number | null;
  companySizeMax: number | null;
  isActive: boolean;
  _count: { leads: number; discoveryRuns: number };
  discoveryRuns: { status: string; startedAt: string }[];
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function IcpListPage() {
  const [profiles, setProfiles] = useState<IcpProfile[]>([]);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/icp-profiles");
    const data = await res.json();
    setProfiles(data.icpProfiles ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="ICP Search"
        subtitle="Define an Ideal Customer Profile — the Prospector agent searches the web and imports matching leads"
        actions={
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + New ICP
          </button>
        }
      />
      <div className="p-8">
        {profiles.length === 0 ? (
          <EmptyState title="No ICPs yet" subtitle="Define one to start AI-driven lead discovery." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {profiles.map((p) => {
              const lastRun = p.discoveryRuns[0];
              return (
                <Link key={p.id} href={`/icp/${p.id}`} className="card p-5 block hover:border-brand-300">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold">{p.name}</h3>
                    <span className={`badge ${p.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}>
                      {p.isActive ? "Active" : "Paused"}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">{p.description ?? "No description"}</p>
                  {p.industries && p.industries.length > 0 && (
                    <p className="text-xs text-slate-400 mt-2">{p.industries.join(", ")}</p>
                  )}
                  <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                    <span>{p._count.leads} lead(s) found</span>
                    <span>{p._count.discoveryRuns} run(s)</span>
                    {lastRun && <span>Last run: {lastRun.status}</span>}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
      {showModal && <NewIcpModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}

function NewIcpModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    name: "",
    description: "",
    industries: "",
    companySizeMin: "",
    companySizeMax: "",
    jobTitles: "",
    geographies: "",
    technologies: "",
    keywords: "",
    exclusions: "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/icp-profiles", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          description: form.description || undefined,
          industries: splitList(form.industries),
          companySizeMin: form.companySizeMin ? Number(form.companySizeMin) : undefined,
          companySizeMax: form.companySizeMax ? Number(form.companySizeMax) : undefined,
          jobTitles: splitList(form.jobTitles),
          geographies: splitList(form.geographies),
          technologies: splitList(form.technologies),
          keywords: splitList(form.keywords),
          exclusions: form.exclusions || undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create ICP");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ICP");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="font-semibold text-lg mb-4">New ICP</h2>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Mid-market RevOps leaders" />
          </div>
          <div>
            <label className="label">Description</label>
            <input className="input" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="label">Industries (comma-separated)</label>
            <input className="input" value={form.industries} onChange={(e) => setForm({ ...form, industries: e.target.value })} placeholder="B2B SaaS, Fintech" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Min company size</label>
              <input className="input" type="number" min={0} value={form.companySizeMin} onChange={(e) => setForm({ ...form, companySizeMin: e.target.value })} />
            </div>
            <div>
              <label className="label">Max company size</label>
              <input className="input" type="number" min={0} value={form.companySizeMax} onChange={(e) => setForm({ ...form, companySizeMax: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Job titles / personas (comma-separated)</label>
            <input className="input" value={form.jobTitles} onChange={(e) => setForm({ ...form, jobTitles: e.target.value })} placeholder="VP Sales, Head of RevOps" />
          </div>
          <div>
            <label className="label">Geographies (comma-separated)</label>
            <input className="input" value={form.geographies} onChange={(e) => setForm({ ...form, geographies: e.target.value })} placeholder="United States, Canada" />
          </div>
          <div>
            <label className="label">Technologies used (comma-separated)</label>
            <input className="input" value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} placeholder="Salesforce, HubSpot" />
          </div>
          <div>
            <label className="label">Other keywords / buying signals (comma-separated)</label>
            <input className="input" value={form.keywords} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="hiring SDRs, recently funded" />
          </div>
          <div>
            <label className="label">Exclusions</label>
            <textarea className="input" rows={2} value={form.exclusions} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} placeholder="Skip agencies, skip companies under 10 employees" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Creating…" : "Create ICP"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
