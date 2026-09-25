"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { PageHeader, EmptyState, StatusBadge, ScoreBadge, Modal, Tabs, StatTile } from "@/components/ui";
import { leadDisplayName } from "@/lib/format";

interface Template {
  id: string;
  name: string;
}

interface Step {
  order: number;
  delayHours: number;
  templateId: string;
}

interface EnrolledLead {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  status: string;
  score: number | null;
}

interface Enrollment {
  id: string;
  currentStep: number;
  nextStepDueAt: string | null;
  completedAt: string | null;
  stoppedReason: string | null;
  createdAt: string;
  lead: EnrolledLead;
}

interface Sequence {
  id: string;
  name: string;
  triggerType: string;
  steps: Step[];
  enrollments: Enrollment[];
}

interface Campaign {
  id: string;
  name: string;
  goal: string | null;
  status: string;
  sequences: Sequence[];
}

interface SequenceStat {
  sequenceId: string;
  name: string;
  enrolled: number;
  active: number;
  completed: number;
  stopped: number;
}

interface Stats {
  totalEnrolled: number;
  active: number;
  completed: number;
  stopped: number;
  emailsSent: number;
  opens: number;
  replies: number;
  replyRate: number;
  meetingsBooked: number;
  perSequence: SequenceStat[];
}

interface ActivityItem {
  id: string;
  type: string;
  actor: string;
  agentName: string | null;
  createdAt: string;
  payload: Record<string, unknown> | null;
  lead: { id: string; firstName: string | null; lastName: string | null };
}

const STATUS_OPTIONS = ["draft", "active", "paused", "archived"];
const TRIGGER_OPTIONS: { value: string; label: string }[] = [
  { value: "lead_qualified", label: "When a lead becomes qualified" },
  { value: "manual", label: "Only when manually enrolled" },
  { value: "form_submission", label: "When a form is submitted" },
];
const TAB_OPTIONS = [
  { id: "overview", label: "Overview" },
  { id: "sequences", label: "Sequences" },
  { id: "leads", label: "Leads" },
  { id: "emails", label: "Emails" },
  { id: "history", label: "History" },
] as const;
type TabId = (typeof TAB_OPTIONS)[number]["id"];

function enrollmentStatus(e: { completedAt: string | null; stoppedReason: string | null }) {
  if (e.completedAt) return "completed";
  if (e.stoppedReason) return "stopped";
  return "active";
}

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([]);
  const [emails, setEmails] = useState<ActivityItem[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tab, setTab] = useState<TabId>("overview");
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
    setStats(campaignData.stats ?? null);
    setRecentActivity(campaignData.recentActivity ?? []);
    setEmails(campaignData.emails ?? []);
    setTemplates(templatesData.templates ?? []);
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function setStatus(status: string) {
    if (!campaign) return;
    const prev = campaign;
    setCampaign({ ...campaign, status });
    const res = await fetch(`/api/campaigns/${campaign.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) setCampaign(prev);
  }

  async function deleteCampaign() {
    if (!campaign) return;
    if (!confirm("Delete this campaign, its sequences, and all enrollment history? This can't be undone.")) return;
    await fetch(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
    router.push("/campaigns");
  }

  async function deleteSequence(sequenceId: string) {
    if (!campaign) return;
    if (
      !confirm(
        "Delete this sequence? Leads currently enrolled stop receiving it immediately, and their enrollment history for this sequence is permanently deleted.",
      )
    )
      return;
    await fetch(`/api/campaigns/${campaign.id}/sequences/${sequenceId}`, { method: "DELETE" });
    load();
  }

  const allEnrollments = useMemo(
    () =>
      campaign?.sequences.flatMap((seq) => seq.enrollments.map((e) => ({ ...e, sequenceId: seq.id, sequenceName: seq.name }))) ?? [],
    [campaign],
  );

  if (!campaign) return null;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        subtitle={campaign.goal ?? "No goal set"}
        actions={
          <div className="flex items-center gap-2">
            <select className="input !w-auto !py-1.5 text-xs cursor-pointer" value={campaign.status} onChange={(e) => setStatus(e.target.value)}>
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
      <div className="px-8 pt-4 bg-white border-b border-slate-200">
        <Tabs tabs={TAB_OPTIONS} active={tab} onChange={setTab} />
      </div>
      <div className="p-8">
        {campaign.status !== "active" && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
            This campaign is <strong>{campaign.status}</strong> — sequences triggered by &ldquo;lead becomes qualified&rdquo; won&rsquo;t auto-enroll anyone until you set it to Active.
          </p>
        )}
        {templates.length === 0 && (
          <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
            Create an email template first before building a sequence.
          </p>
        )}

        {tab === "overview" && <OverviewTab campaign={campaign} stats={stats} recentActivity={recentActivity} onViewHistory={() => setTab("history")} />}
        {tab === "sequences" && (
          <SequencesTab
            campaign={campaign}
            templates={templates}
            onEditSequence={setEditingSequence}
            onDeleteSequence={deleteSequence}
          />
        )}
        {tab === "leads" && <LeadsTab enrollments={allEnrollments} sequences={campaign.sequences} />}
        {tab === "emails" && <EmailsTab items={emails} />}
        {tab === "history" && <HistoryTab items={recentActivity} />}
      </div>

      {showModal && (
        <SequenceFormModal
          mode="create"
          campaignId={campaign.id}
          templates={templates}
          onClose={() => setShowModal(false)}
          onSaved={load}
        />
      )}
      {editingSequence && (
        <SequenceFormModal
          mode="edit"
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

function OverviewTab({
  campaign,
  stats,
  recentActivity,
  onViewHistory,
}: {
  campaign: Campaign;
  stats: Stats | null;
  recentActivity: ActivityItem[];
  onViewHistory: () => void;
}) {
  if (!stats) return null;
  const tiles = [
    { label: "Enrolled", value: stats.totalEnrolled },
    { label: "Active", value: stats.active },
    { label: "Completed", value: stats.completed },
    { label: "Stopped", value: stats.stopped },
    { label: "Emails sent", value: stats.emailsSent },
    { label: "Opens", value: stats.opens },
    { label: "Reply rate", value: `${stats.replyRate}%`, hint: `${stats.replies} replies` },
    { label: "Meetings booked", value: stats.meetingsBooked },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tiles.map((t) => (
          <StatTile key={t.label} label={t.label} value={t.value} hint={t.hint} />
        ))}
      </div>

      {campaign.sequences.length > 0 && (
        <div className="card p-6">
          <h2 className="font-semibold mb-4">Sequence performance</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b border-slate-100">
                  <th className="py-2 pr-4 font-medium">Sequence</th>
                  <th className="py-2 pr-4 font-medium">Enrolled</th>
                  <th className="py-2 pr-4 font-medium">Active</th>
                  <th className="py-2 pr-4 font-medium">Completed</th>
                  <th className="py-2 pr-4 font-medium">Stopped</th>
                </tr>
              </thead>
              <tbody>
                {stats.perSequence.map((s) => (
                  <tr key={s.sequenceId} className="border-b border-slate-50 last:border-0">
                    <td className="py-2 pr-4 font-medium">{s.name}</td>
                    <td className="py-2 pr-4">{s.enrolled}</td>
                    <td className="py-2 pr-4">{s.active}</td>
                    <td className="py-2 pr-4">{s.completed}</td>
                    <td className="py-2 pr-4">{s.stopped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold">Recent activity</h2>
          {recentActivity.length > 0 && (
            <button onClick={onViewHistory} className="text-sm text-brand-600 font-medium hover:underline">
              View all →
            </button>
          )}
        </div>
        {recentActivity.length === 0 ? (
          <p className="text-sm text-slate-400">
            No activity yet — once leads enroll and receive touches, that history shows up here.
          </p>
        ) : (
          <ActivityList items={recentActivity.slice(0, 5)} />
        )}
      </div>
    </div>
  );
}

function SequencesTab({
  campaign,
  templates,
  onEditSequence,
  onDeleteSequence,
}: {
  campaign: Campaign;
  templates: Template[];
  onEditSequence: (s: Sequence) => void;
  onDeleteSequence: (id: string) => void;
}) {
  if (campaign.sequences.length === 0) {
    return <EmptyState title="No sequences yet" subtitle="A sequence is a series of timed, templated touches." />;
  }
  return (
    <div className="space-y-4">
      {campaign.sequences.map((seq) => (
        <div key={seq.id} className="card p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{seq.name}</h3>
              <span className="text-xs text-slate-400">
                {seq.enrollments.length} enrolled
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="badge bg-slate-100 text-slate-600">
                {TRIGGER_OPTIONS.find((t) => t.value === seq.triggerType)?.label ?? seq.triggerType.replace(/_/g, " ")}
              </span>
              <button className="text-xs text-slate-500 font-medium hover:underline" onClick={() => onEditSequence(seq)}>
                Edit
              </button>
              <button className="text-xs text-red-600 font-medium hover:underline" onClick={() => onDeleteSequence(seq.id)}>
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
  );
}

function LeadsTab({
  enrollments,
  sequences,
}: {
  enrollments: (Enrollment & { sequenceId: string; sequenceName: string })[];
  sequences: Sequence[];
}) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? enrollments : enrollments.filter((e) => e.sequenceId === filter);
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (enrollments.length === 0) {
    return (
      <EmptyState
        title="No leads enrolled yet"
        subtitle="Leads enroll automatically when they become qualified (if a sequence triggers on that) or can be enrolled manually from a lead's page."
      />
    );
  }

  return (
    <div className="card p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold">Enrolled leads</h2>
        {sequences.length > 1 && (
          <select className="input !w-auto text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All sequences</option>
            {sequences.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b border-slate-100">
              <th className="py-2 pr-4 font-medium">Lead</th>
              <th className="py-2 pr-4 font-medium">Sequence</th>
              <th className="py-2 pr-4 font-medium">Status</th>
              <th className="py-2 pr-4 font-medium">Step</th>
              <th className="py-2 pr-4 font-medium">Enrolled</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((e) => {
              const status = enrollmentStatus(e);
              return (
                <tr key={e.id} className="border-b border-slate-50 last:border-0">
                  <td className="py-2 pr-4">
                    <Link href={`/leads/${e.lead.id}`} className="font-medium hover:text-brand-600">
                      {leadDisplayName(e.lead)}
                    </Link>
                    <div className="text-xs text-slate-400">{e.lead.email ?? "No email on file"}</div>
                  </td>
                  <td className="py-2 pr-4 text-slate-600">{e.sequenceName}</td>
                  <td className="py-2 pr-4">
                    <StatusBadge status={status} />
                    {status === "stopped" && e.stoppedReason && (
                      <div className="text-xs text-slate-400 mt-0.5">{e.stoppedReason}</div>
                    )}
                  </td>
                  <td className="py-2 pr-4 text-slate-600">Step {e.currentStep + 1}</td>
                  <td className="py-2 pr-4 text-slate-500 text-xs">{new Date(e.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EmailsTab({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="No emails yet"
        subtitle="Sent emails and replies for this campaign's leads will show up here."
      />
    );
  }
  return (
    <div className="space-y-4">
      {items.map((a) => (
        <div key={a.id} className="card p-5">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`badge ${a.type === "email_sent" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                {a.type === "email_sent" ? "Sent" : "Received"}
              </span>
              <Link href={`/leads/${a.lead.id}`} className="font-medium hover:text-brand-600">
                {leadDisplayName(a.lead)}
              </Link>
            </div>
            <span className="text-xs text-slate-400">{new Date(a.createdAt).toLocaleString()}</span>
          </div>

          {a.type === "email_sent" ? (
            <>
              <div className="font-medium text-sm mb-1">{(a.payload?.subject as string) ?? "(no subject)"}</div>
              <p className="text-sm text-slate-600 whitespace-pre-wrap">{(a.payload?.body as string) ?? "(no content)"}</p>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2">
                {typeof a.payload?.intent === "string" && <StatusBadge status={a.payload.intent} />}
                {typeof a.payload?.confidence === "number" && (
                  <span className="text-xs text-slate-400">{Math.round(a.payload.confidence * 100)}% confidence</span>
                )}
              </div>
              {typeof a.payload?.replyText === "string" ? (
                <div>
                  <div className="text-xs text-slate-500 mb-1">What they wrote</div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap bg-slate-50 border border-slate-100 rounded-lg px-3 py-2">
                    {a.payload.replyText}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400 italic">
                  Original message text not captured for this reply (captured for replies received after this feature shipped).
                </p>
              )}
              {typeof a.payload?.suggested_reply === "string" && a.payload.suggested_reply && (
                <div className="mt-2">
                  <div className="text-xs text-slate-500 mb-1">AI-suggested response</div>
                  <p className="text-sm text-slate-600 whitespace-pre-wrap">{a.payload.suggested_reply}</p>
                </div>
              )}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function HistoryTab({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <EmptyState title="No activity yet" subtitle="Emails sent, replies, and other touches for this campaign's leads will show up here." />;
  }
  return (
    <div className="card p-6">
      <h2 className="font-semibold mb-4">Activity history</h2>
      <ActivityList items={items} showLead />
    </div>
  );
}

function ActivityList({ items, showLead = true }: { items: ActivityItem[]; showLead?: boolean }) {
  return (
    <div className="space-y-4">
      {items.map((a) => (
        <div key={a.id} className="flex gap-3 text-sm">
          <div className="w-2 h-2 mt-1.5 rounded-full bg-brand-400 shrink-0" />
          <div>
            <div className="font-medium">
              {a.type.replace(/_/g, " ")}
              {showLead && (
                <>
                  {" · "}
                  <Link href={`/leads/${a.lead.id}`} className="text-brand-600 hover:underline">
                    {leadDisplayName(a.lead)}
                  </Link>
                </>
              )}
              <span className="text-slate-400 font-normal">
                {" "}
                · {a.actor}
                {a.agentName ? ` (${a.agentName})` : ""}
              </span>
            </div>
            <div className="text-xs text-slate-400 mt-0.5">{new Date(a.createdAt).toLocaleString()}</div>
          </div>
        </div>
      ))}
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
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, goal: goal || null }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save campaign");
      onSaved({ name, goal: goal || null });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit campaign" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
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
    </Modal>
  );
}

function SequenceFormModal({
  mode,
  campaignId,
  sequence,
  templates,
  onClose,
  onSaved,
}: {
  mode: "create" | "edit";
  campaignId: string;
  sequence?: Sequence;
  templates: Template[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(sequence?.name ?? "");
  const [triggerType, setTriggerType] = useState(sequence?.triggerType ?? "lead_qualified");
  const [steps, setSteps] = useState<Step[]>(
    sequence?.steps ?? [{ order: 0, delayHours: 0, templateId: templates[0]?.id ?? "" }],
  );
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
      const url =
        mode === "create"
          ? `/api/campaigns/${campaignId}/sequences`
          : `/api/campaigns/${campaignId}/sequences/${sequence!.id}`;
      const res = await fetch(url, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, triggerType, steps }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to save sequence");
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sequence");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={mode === "create" ? "New sequence" : "Edit sequence"} onClose={onClose} maxWidth="max-w-lg">
      <form onSubmit={submit} className="space-y-4">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="label">Sequence name</label>
          <input
            className="input"
            required
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Qualified lead nurture"
          />
        </div>
        <div>
          <label className="label">Enroll leads…</label>
          <select className="input" value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
            {TRIGGER_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
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
              <select className="input" value={step.templateId} onChange={(e) => updateStep(idx, { templateId: e.target.value })}>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              {steps.length > 1 && (
                <button type="button" className="text-xs text-red-600 hover:underline shrink-0" onClick={() => removeStep(idx)}>
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
            {saving ? "Saving…" : mode === "create" ? "Create sequence" : "Save sequence"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
