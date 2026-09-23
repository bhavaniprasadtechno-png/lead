"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PageHeader, StatusBadge, ScoreBadge, EmptyState, Modal } from "@/components/ui";
import { LEAD_STATUSES } from "@/lib/constants";
import { buildCsv } from "@/lib/csv";

interface Lead {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  company: string | null;
  jobTitle: string | null;
  status: string;
  score: number | null;
  source: string;
  owner: { id: string; name: string } | null;
}

export default function LeadsPage() {
  const searchParams = useSearchParams();
  const icpId = searchParams.get("icpId");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (status) params.set("status", status);
    if (icpId) params.set("icpId", icpId);
    const res = await fetch(`/api/leads?${params.toString()}`);
    const data = await res.json();
    setLeads(data.leads ?? []);
    setLoading(false);
  }, [q, status, icpId]);

  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this lead? This removes its activity, enrichment, and sequence history too.")) return;
    setLeads((prev) => prev.filter((l) => l.id !== id));
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }

  return (
    <div>
      <PageHeader
        title="Leads"
        subtitle="Every lead captured across your channels, enriched and scored by AI"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setShowBulkModal(true)}>
              Bulk upload
            </button>
            <button className="btn-primary" onClick={() => setShowModal(true)}>
              + Add lead
            </button>
          </>
        }
      />
      <div className="p-8">
        {icpId && (
          <div className="card p-3 mb-4 text-sm bg-brand-50 border-brand-200 text-brand-700 flex items-center justify-between">
            <span>Filtered to leads discovered by one ICP</span>
            <Link href="/leads" className="font-medium hover:underline">
              Clear filter
            </Link>
          </div>
        )}
        <div className="flex gap-3 mb-4">
          <input
            className="input max-w-xs"
            placeholder="Search name, email, company…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="input max-w-[200px]" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Company</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Score</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {leads.map((lead) => (
                <tr key={lead.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Link href={`/leads/${lead.id}`} className="font-medium text-slate-900 hover:text-brand-600">
                      {lead.firstName} {lead.lastName}
                    </Link>
                    <div className="text-slate-400 text-xs">{lead.email ?? "No email on file"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {lead.company ?? "—"}
                    {lead.jobTitle && <div className="text-xs text-slate-400">{lead.jobTitle}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.source.replace(/_/g, " ")}</td>
                  <td className="px-4 py-3">
                    <ScoreBadge score={lead.score} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{lead.owner?.name ?? "Unassigned"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      className="text-xs text-red-600 font-medium hover:underline"
                      onClick={() => remove(lead.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && leads.length === 0 && <EmptyState title="No leads found" subtitle="Try adjusting filters or add a new lead." />}
        </div>
      </div>

      {showModal && <AddLeadModal onClose={() => setShowModal(false)} onCreated={load} />}
      {showBulkModal && <BulkUploadModal onClose={() => setShowBulkModal(false)} onCreated={load} />}
    </div>
  );
}

const CSV_TEMPLATE_HEADERS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "company",
  "jobTitle",
  "linkedinUrl",
  "website",
];

function downloadCsvTemplate() {
  const csv = buildCsv(CSV_TEMPLATE_HEADERS, [
    ["Jordan", "Lee", "jordan@example.com", "", "Example Corp", "VP Sales", "", "example.com"],
  ]);
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "leadpilot-leads-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

interface BulkUploadResult {
  created: number;
  skipped: number;
  totalRows: number;
  errors: { row: number; error: string }[];
}

function BulkUploadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<BulkUploadResult | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setError(null);
    setResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/leads/bulk-upload", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Upload failed");
      setResult(data);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Modal title="Bulk upload leads" onClose={onClose} maxWidth="max-w-lg">
      <div className="space-y-4">
        <div className="text-sm text-slate-600">
          <p>
            Upload a CSV of leads. Only <span className="font-medium">firstName</span> is required — leave the
            rest blank and each lead is automatically enriched (company data via Apollo) and scored by the AI
            agents once imported, same as a manually added lead.
          </p>
          <button type="button" className="text-brand-600 font-medium hover:underline mt-2" onClick={downloadCsvTemplate}>
            Download CSV template →
          </button>
        </div>

        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}

        {result && (
          <div className="text-sm bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 space-y-1">
            <p>
              <span className="font-medium text-emerald-700">{result.created} created</span>
              {result.skipped > 0 && <span className="text-slate-500"> · {result.skipped} skipped (duplicate email)</span>}
              {result.errors.length > 0 && <span className="text-red-600"> · {result.errors.length} failed</span>}
              <span className="text-slate-400"> · {result.totalRows} rows total</span>
            </p>
            {result.errors.length > 0 && (
              <ul className="text-xs text-red-600 list-disc pl-4 max-h-32 overflow-y-auto">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    Row {e.row}: {e.error}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">CSV file</label>
            <input
              className="input"
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              {result ? "Done" : "Cancel"}
            </button>
            <button type="submit" disabled={!file || uploading} className="btn-primary">
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}

function AddLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    jobTitle: "",
    phone: "",
    website: "",
    source: "manual",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create lead");
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create lead");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="font-semibold text-lg mb-4">Add lead</h2>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First name</label>
              <input className="input" required value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="label">Last name</label>
              <input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Company</label>
              <input className="input" value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
            </div>
            <div>
              <label className="label">Job title</label>
              <input className="input" value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Source</label>
            <select className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              <option value="manual">Manual</option>
              <option value="web_form">Web form</option>
              <option value="landing_page">Landing page</option>
              <option value="csv_import">CSV import</option>
              <option value="linkedin">LinkedIn</option>
              <option value="referral">Referral</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Adding…" : "Add lead"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
