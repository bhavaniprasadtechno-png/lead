"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/ui";

interface IcpProfile {
  id: string;
  name: string;
  description: string | null;
  industries: string[] | null;
  companySizeMin: number | null;
  companySizeMax: number | null;
  jobTitles: string[] | null;
  geographies: string[] | null;
  technologies: string[] | null;
  keywords: string[] | null;
  exclusions: string | null;
  isActive: boolean;
}

interface Run {
  id: string;
  status: string;
  leadsFound: number | null;
  leadsCreated: number | null;
  leadsSkipped: number | null;
  errorMessage: string | null;
  startedAt: string;
  completedAt: string | null;
}

function joinList(value: string[] | null): string {
  return (value ?? []).join(", ");
}
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function IcpDetailPage() {
  const params = useParams<{ id: string }>();
  const [icp, setIcp] = useState<IcpProfile | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [icpRes, runsRes] = await Promise.all([
      fetch(`/api/icp-profiles/${params.id}`),
      fetch(`/api/icp-profiles/${params.id}/runs`),
    ]);
    const icpData = await icpRes.json();
    const runsData = await runsRes.json();
    const p: IcpProfile | null = icpData.icpProfile ?? null;
    setIcp(p);
    setRuns(runsData.runs ?? []);
    if (p) {
      setForm({
        name: p.name,
        description: p.description ?? "",
        industries: joinList(p.industries),
        companySizeMin: p.companySizeMin?.toString() ?? "",
        companySizeMax: p.companySizeMax?.toString() ?? "",
        jobTitles: joinList(p.jobTitles),
        geographies: joinList(p.geographies),
        technologies: joinList(p.technologies),
        keywords: joinList(p.keywords),
        exclusions: p.exclusions ?? "",
      });
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    await fetch(`/api/icp-profiles/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        description: form.description || null,
        industries: splitList(form.industries),
        companySizeMin: form.companySizeMin ? Number(form.companySizeMin) : null,
        companySizeMax: form.companySizeMax ? Number(form.companySizeMax) : null,
        jobTitles: splitList(form.jobTitles),
        geographies: splitList(form.geographies),
        technologies: splitList(form.technologies),
        keywords: splitList(form.keywords),
        exclusions: form.exclusions || null,
      }),
    });
    setSaving(false);
    load();
  }

  async function toggleActive() {
    if (!icp) return;
    await fetch(`/api/icp-profiles/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ isActive: !icp.isActive }),
    });
    load();
  }

  async function runSearch() {
    setStarting(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/icp-profiles/${params.id}/discover`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to start search");
      }
      setMessage("Search started — the Prospector agent is searching the web. Refresh to see progress.");
      load();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to start search");
    } finally {
      setStarting(false);
    }
  }

  if (!icp) return null;

  return (
    <div>
      <PageHeader
        title={icp.name}
        subtitle={icp.description ?? "No description"}
        actions={
          <>
            <button className="btn-secondary" onClick={toggleActive}>
              {icp.isActive ? "Pause" : "Activate"}
            </button>
            <button className="btn-primary" onClick={runSearch} disabled={starting}>
              {starting ? "Starting…" : "Run Search Now"}
            </button>
          </>
        }
      />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {message && <div className="card p-4 text-sm bg-brand-50 border-brand-200 text-brand-700">{message}</div>}

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Criteria</h2>
              <button onClick={save} disabled={saving} className="btn-primary">
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="label">Name</label>
                <input className="input" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">Description</label>
                <input className="input" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <label className="label">Industries</label>
                <input className="input" value={form.industries ?? ""} onChange={(e) => setForm({ ...form, industries: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Min company size</label>
                  <input className="input" type="number" min={0} value={form.companySizeMin ?? ""} onChange={(e) => setForm({ ...form, companySizeMin: e.target.value })} />
                </div>
                <div>
                  <label className="label">Max company size</label>
                  <input className="input" type="number" min={0} value={form.companySizeMax ?? ""} onChange={(e) => setForm({ ...form, companySizeMax: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Job titles / personas</label>
                <input className="input" value={form.jobTitles ?? ""} onChange={(e) => setForm({ ...form, jobTitles: e.target.value })} />
              </div>
              <div>
                <label className="label">Geographies</label>
                <input className="input" value={form.geographies ?? ""} onChange={(e) => setForm({ ...form, geographies: e.target.value })} />
              </div>
              <div>
                <label className="label">Technologies</label>
                <input className="input" value={form.technologies ?? ""} onChange={(e) => setForm({ ...form, technologies: e.target.value })} />
              </div>
              <div>
                <label className="label">Other keywords / buying signals</label>
                <input className="input" value={form.keywords ?? ""} onChange={(e) => setForm({ ...form, keywords: e.target.value })} />
              </div>
              <div>
                <label className="label">Exclusions</label>
                <textarea className="input" rows={2} value={form.exclusions ?? ""} onChange={(e) => setForm({ ...form, exclusions: e.target.value })} />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Discovery runs</h2>
            {runs.length === 0 ? (
              <EmptyState title="No runs yet" subtitle="Click Run Search Now to start the Prospector agent." />
            ) : (
              <div className="space-y-3">
                {runs.map((run) => (
                  <div key={run.id} className="text-sm border-b border-slate-100 pb-3 last:border-0">
                    <div className="flex items-center justify-between">
                      <span
                        className={`badge ${
                          run.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : run.status === "failed"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {run.status}
                      </span>
                      <span className="text-xs text-slate-400">{new Date(run.startedAt).toLocaleString()}</span>
                    </div>
                    {run.status === "completed" && (
                      <div className="text-xs text-slate-500 mt-1">
                        {run.leadsFound ?? 0} candidate(s) found · {run.leadsCreated ?? 0} imported as leads ·{" "}
                        {run.leadsSkipped ?? 0} duplicate(s) skipped
                      </div>
                    )}
                    {run.errorMessage && <div className="text-xs text-red-600 mt-1">{run.errorMessage}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="card p-6 h-fit">
          <h2 className="font-semibold mb-4">Discovered leads</h2>
          <p className="text-sm text-slate-500 mb-3">
            Every candidate this ICP finds shows up as a lead. Ones with a verified email flow into the normal
            enrichment → scoring → outreach pipeline; the rest just wait for contact info.
          </p>
          <Link href={`/leads?icpId=${icp.id}`} className="btn-secondary w-full justify-center">
            View leads from this ICP
          </Link>
        </div>
      </div>
    </div>
  );
}
