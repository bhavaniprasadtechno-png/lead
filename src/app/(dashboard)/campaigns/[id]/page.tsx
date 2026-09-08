"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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

const STATUS_OPTIONS = ["draft", "active", "paused", "archived"];

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editingSequence, setEditingSequence] = useState<Sequence | null>(null);
  const [editingCampaign, setEditingCampaign] = useState(false);

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

  async function setStatus(status: string) {
    if (!campaign) return;
    setCampaign({ ...campaign, status });
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
  }

  async function deleteCampaign() {
    if (!campaign) return;
    if (!confirm("Delete this campaign and all its sequences? This can't be undone.")) return;
    await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
    router.push("/campaigns");
  }

  async function deleteSequence(sequenceId: string) {
    if (!campaign) return;
    if (!confirm("Delete this sequence? Leads currently enrolled will stop receiving it.")) return;
    await fetch(`/api/campaigns/${campaign.id}/sequences/${sequenceId}`, { method: "DELETE" });
    load();
  }

  if (!campaign) return null;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        subtitle={campaign.goal ?? "No goal set"}
        actions={
          <div className="flex items-center gap-2">
            <select
              className={`badge cursor-pointer border-0 ${
                campaign.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
              value={campaign.status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <button className="btn-secondary" onClick={() => setEditingCampaign(true)}>
              Edit
            </button>
            <button className="btn-primary" onClick={() => setShowModal(true)} disabled={templates.length === 0}>
              + New sequence
            </button>
            <button className="btn-danger" onClick={deleteCampaign}>
              Delete
            </button>
          </div>
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
                  <div className="flex items-center gap-2">
                    <span className="badge bg-slate-100 text-slate-600">{seq.triggerType.replace(/_/g, " ")}</span>
                    <button
                      className="text-xs text-slate-500 font-medium hover:underline"
                      onClick={() => setEditingSequence(seq)}
                    >
                      Edit
                    </button>
                    <button
                      className="text-xs text-red-600 font-medium hover:underline"
                      onClick={() => deleteSequence(seq.id)}
                    >
                      Delete
                    </button>
                  </div>
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
      {editingSequence && (
        <EditSequenceModal
          campaignId={campaign.id}
          sequence={editingSequence}
          templates={templates}
          onClose={() => setEditingSequence(null)}
          onSaved={load}
        />
      )}
      {editingCampaign && (
        <EditCampaignModal
          campaign={campaign}
          onClose={() => setEditingCampaign(false)}
          onSaved={(c) => setCampaign((prev) => (prev ? { ...prev, ...c } : prev))}
        />
      )}
    </div>
  );
}

function EditCampaignModal({
  campaign,
  onClose,
  onSaved,
}: {
  campaign: Campaign;
  onClose: () => void;
  onSaved: (c: { name: string; goal: string | null }) => void;
}) {
  const [name, setName] = useState(campaign.name);
  const [goal, setGoal] = useState(campaign.goal ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, goal: goal || null }),
    });
    setSaving(false);
    onSaved({ name, goal: goal || null });
    onClose();
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="font-semibold text-lg mb-4">Edit campaign</h2>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label">Goal</label>
            <input className="input" value={goal} onChange={(e) => setGoal(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function EditSequenceModal({
  campaignId,
  sequence,
  templates,
  onClose,
  onSaved,
}: {
  campaignId: string;
  sequence: Sequence;
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(sequence.name);
  const [steps, setSteps] = useState<Step[]>(sequence.steps);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStep() {
    setSteps((s) => [...s, { order: s.length, delayHours: 72, templateId: templates[0]?.id ?? "" }]);
  }

  function removeStep(idx: number) {
    setSteps((s) => s.filter((_, i) => i !== idx).map((step, i) => ({ ...step, order: i })));
  }

  function updateStep(idx: number, patch: Partial<Step>) {
    setSteps((s) => s.map((step, i) => (i === idx ? { ...step, ...patch } : step)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/sequences/${sequence.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, steps }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to save sequence");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sequence");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 px-4">
      <div className="card w-full max-w-lg p-6 max-h-[85vh] overflow-y-auto">
        <h2 className="font-semibold text-lg mb-4">Edit sequence</h2>
        <form onSubmit={submit} className="space-y-4">
          {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
          <div>
            <label className="label">Sequence name</label>
            <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
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
                {steps.length > 1 && (
                  <button type="button" className="text-xs text-red-600 hover:underline" onClick={() => removeStep(idx)}>
                    Remove
                  </button>
                )}
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
              {saving ? "Saving…" : "Save sequence"}
            </button>
          </div>
        </form>
      </div>
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
