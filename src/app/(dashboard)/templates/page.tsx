"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader, EmptyState } from "@/components/ui";

interface Template {
  id: string;
  name: string;
  subject: string;
  bodyPrompt: string;
  tone: string;
}

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/email-templates");
    const data = await res.json();
    setTemplates(data.templates ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Email templates"
        subtitle="Templates describe tone & goal — the Email Personalization Agent drafts the actual copy per lead"
        actions={
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + New template
          </button>
        }
      />
      <div className="p-8">
        {templates.length === 0 ? (
          <EmptyState title="No templates yet" subtitle="Create one to start sequences." />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {templates.map((t) => (
              <div key={t.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{t.name}</h3>
                  <span className="badge bg-slate-100 text-slate-600">{t.tone}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">Subject: {t.subject}</p>
                <p className="text-sm text-slate-600 mt-2 line-clamp-3">{t.bodyPrompt}</p>
              </div>
            ))}
          </div>
        )}
      </div>
      {showModal && <NewTemplateModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}

function NewTemplateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ name: "", subject: "", bodyPrompt: "", tone: "professional" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/email-templates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create template");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create template");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-lg p-6">
        <h2 className="font-semibold text-lg mb-4">New email template</h2>
        <form onSubmit={submit} className="space-y-3">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="First touch — SaaS" />
          </div>
          <div>
            <label className="label">Default subject (AI may adapt)</label>
            <input className="input" required value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </div>
          <div>
            <label className="label">Goal / tone brief for the AI writer</label>
            <textarea
              className="input"
              rows={4}
              required
              value={form.bodyPrompt}
              onChange={(e) => setForm({ ...form, bodyPrompt: e.target.value })}
              placeholder="Introduce our product, reference a specific detail from enrichment data, ask a low-friction question."
            />
          </div>
          <div>
            <label className="label">Tone</label>
            <select className="input" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="direct">Direct</option>
              <option value="consultative">Consultative</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save template"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
