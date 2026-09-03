"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader, EmptyState } from "@/components/ui";

interface Template {
  id: string;
  name: string;
}

interface Step {
  order: number;
  delayHours: number;
  templateId: string;
}

interface Sequence {
  id: string;
  name: string;
  triggerType: string;
  steps: Step[];
}

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  sequences: Sequence[];
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    const [campaignRes, templatesRes] = await Promise.all([
      fetch(`/api/campaigns/${params.id}`),
      fetch("/api/email-templates"),
    ]);
    const campaignData = await campaignRes.json();
    const templatesData = await templatesRes.json();
    setCampaign(campaignData.campaign ?? null);
    setTemplates(templatesData.templates ?? []);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  if (!campaign) return null;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        subtitle={campaign.goal ?? "No goal set"}
        actions={
          <button className="btn-primary" onClick={() => setShowModal(true)} disabled={templates.length === 0}>
            + New sequence
          </button>
        }
      />
      <div className="p-8">
        {templates.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-4">
            Create an email template first before building a sequence.
          </p>
        )}
        {campaign.sequences.length === 0 ? (
          <EmptyState title="No sequences yet" subtitle="A sequence is a series of timed, templated touches." />
        ) : (
          <div className="space-y-4">
            {campaign.sequences.map((seq) => (
              <div key={seq.id} className="card p-5">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{seq.name}</h3>
                  <span className="badge bg-slate-100 text-slate-600">{seq.triggerType.replace(/_/g, " ")}</span>
                </div>
                <ol className="mt-3 space-y-2">
                  {seq.steps
                    .sort((a, b) => a.order - b.order)
                    .map((step, i) => (
                      <li key={i} className="text-sm text-slate-600 flex items-center gap-2">
                        <span className="badge bg-brand-50 text-brand-700">Step {step.order + 1}</span>
                        <span>+{step.delayHours}h delay</span>
                        <span className="text-slate-400">→</span>
                        <span>{templates.find((t) => t.id === step.templateId)?.name ?? "Unknown template"}</span>
                      </li>
                    ))}
                </ol>
              </div>
            ))}
          </div>
        )}
      </div>
      {showModal && (
        <NewSequenceModal
          campaignId={campaign.id}
          templates={templates}
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}

function NewSequenceModal({
  campaignId,
  templates,
  onClose,
  onCreated,
}: {
  campaignId: string;
  templates: Template[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Step[]>([{ order: 0, delayHours: 0, templateId: templates[0]?.id ?? "" }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStep() {
    setSteps((s) => [...s, { order: s.length, delayHours: 72, templateId: templates[0]?.id ?? "" }]);
  }

  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sequences`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, triggerType: "lead_qualified", steps }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to create sequence");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create sequence");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="font-semibold text-lg mb-4">New sequence</h2>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Sequence name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Qualified lead nurture" />
          </div>
          <div className="space-y-3">
            <label className="label mb-0">Steps</label>
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2">
                <span className="text-xs text-slate-400 w-12">#{idx + 1}</span>
                <input
                  type="number"
                  min={0}
                  className="input w-24"
                  value={step.delayHours}
                  onChange={(e) => updateStep(idx, { delayHours: Number(e.target.value) })}
                />
                <span className="text-xs text-slate-400">hrs delay</span>
                <select
                  className="input"
                  value={step.templateId}
                  onChange={(e) => updateStep(idx, { templateId: e.target.value })}
                >
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
            <button type="button" onClick={addStep} className="text-sm text-brand-600 font-medium hover:underline">
              + Add step
            </button>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Create sequence"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
