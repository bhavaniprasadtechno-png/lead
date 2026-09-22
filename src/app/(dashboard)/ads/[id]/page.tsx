"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { AD_OBJECTIVES, AD_CAMPAIGN_STATUSES, AD_PLATFORMS } from "@/lib/constants";

interface Targeting {
  geographies?: string[];
  ageMin?: number | null;
  ageMax?: number | null;
  genders?: string[];
  interests?: string[];
  keywords?: string[];
}

interface AdCampaignMetric {
  id: string;
  date: string;
  impressions: number;
  clicks: number;
  spend: string;
  leads: number;
}

interface AdCampaign {
  id: string;
  name: string;
  platform: string;
  objective: string;
  status: string;
  dailyBudget: string | null;
  totalBudget: string | null;
  currency: string;
  startDate: string | null;
  endDate: string | null;
  targeting: Targeting | null;
  headline: string | null;
  primaryText: string | null;
  destinationUrl: string | null;
  imageUrl: string | null;
  launchedAt: string | null;
  metrics: AdCampaignMetric[];
}

function joinList(value: string[] | undefined | null): string {
  return (value ?? []).join(", ");
}
function splitList(value: string): string[] {
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

export default function AdCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const [campaign, setCampaign] = useState<AdCampaign | null>(null);
  const [platformConnected, setPlatformConnected] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/ad-campaigns/${params.id}`);
    const data = await res.json();
    const c: AdCampaign | null = data.adCampaign ?? null;
    setCampaign(c);
    setPlatformConnected(!!data.platformConnected);
    if (c) {
      setForm({
        name: c.name,
        objective: c.objective,
        dailyBudget: c.dailyBudget ?? "",
        totalBudget: c.totalBudget ?? "",
        currency: c.currency,
        startDate: c.startDate ? c.startDate.slice(0, 10) : "",
        endDate: c.endDate ? c.endDate.slice(0, 10) : "",
        geographies: joinList(c.targeting?.geographies),
        ageMin: c.targeting?.ageMin?.toString() ?? "",
        ageMax: c.targeting?.ageMax?.toString() ?? "",
        genders: joinList(c.targeting?.genders),
        interests: joinList(c.targeting?.interests),
        keywords: joinList(c.targeting?.keywords),
        headline: c.headline ?? "",
        primaryText: c.primaryText ?? "",
        destinationUrl: c.destinationUrl ?? "",
        imageUrl: c.imageUrl ?? "",
      });
    }
  }, [params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    const res = await fetch(`/api/ad-campaigns/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        objective: form.objective,
        dailyBudget: form.dailyBudget ? Number(form.dailyBudget) : null,
        totalBudget: form.totalBudget ? Number(form.totalBudget) : null,
        currency: form.currency,
        startDate: form.startDate ? new Date(form.startDate).toISOString() : null,
        endDate: form.endDate ? new Date(form.endDate).toISOString() : null,
        targeting: {
          geographies: splitList(form.geographies),
          ageMin: form.ageMin ? Number(form.ageMin) : undefined,
          ageMax: form.ageMax ? Number(form.ageMax) : undefined,
          genders: splitList(form.genders),
          interests: splitList(form.interests),
          keywords: splitList(form.keywords),
        },
        headline: form.headline || null,
        primaryText: form.primaryText || null,
        destinationUrl: form.destinationUrl || null,
        imageUrl: form.imageUrl || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Failed to save");
      return;
    }
    setMessage("Saved.");
    load();
  }

  async function setStatus(status: string) {
    const res = await fetch(`/api/ad-campaigns/${params.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error ?? "Failed to update status");
      return;
    }
    setMessage(null);
    load();
  }

  if (!campaign) return null;

  const platformLabel = AD_PLATFORMS.find((p) => p.value === campaign.platform)?.label ?? campaign.platform;

  return (
    <div>
      <PageHeader
        title={campaign.name}
        subtitle={`${platformLabel} · ${campaign.objective}`}
        actions={
          <select
            className="input !w-auto cursor-pointer"
            value={campaign.status}
            onChange={(e) => setStatus(e.target.value)}
          >
            {AD_CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        }
      />
      <div className="p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {message && <div className="card p-4 text-sm bg-brand-50 border-brand-200 text-brand-700">{message}</div>}

          {!platformConnected && (
            <div className="card p-4 text-sm bg-amber-50 border-amber-200 text-amber-700">
              {platformLabel} isn&apos;t connected yet — connect it on the{" "}
              <a href="/ads" className="underline font-medium">
                Ads page
              </a>{" "}
              before launching this campaign.
            </div>
          )}

          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold">Budget &amp; schedule</h2>
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
                <label className="label">Objective</label>
                <select className="input" value={form.objective ?? ""} onChange={(e) => setForm({ ...form, objective: e.target.value })}>
                  {AD_OBJECTIVES.map((o) => (
                    <option key={o} value={o}>
                      {o}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Daily budget</label>
                  <input className="input" type="number" min={0} step="0.01" value={form.dailyBudget ?? ""} onChange={(e) => setForm({ ...form, dailyBudget: e.target.value })} />
                </div>
                <div>
                  <label className="label">Total budget</label>
                  <input className="input" type="number" min={0} step="0.01" value={form.totalBudget ?? ""} onChange={(e) => setForm({ ...form, totalBudget: e.target.value })} />
                </div>
                <div>
                  <label className="label">Currency</label>
                  <input className="input" value={form.currency ?? ""} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Start date</label>
                  <input className="input" type="date" value={form.startDate ?? ""} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
                </div>
                <div>
                  <label className="label">End date</label>
                  <input className="input" type="date" value={form.endDate ?? ""} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
                </div>
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Targeting</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Geographies (comma-separated)</label>
                <input className="input" value={form.geographies ?? ""} onChange={(e) => setForm({ ...form, geographies: e.target.value })} placeholder="United States, Canada" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Min age</label>
                  <input className="input" type="number" min={13} max={100} value={form.ageMin ?? ""} onChange={(e) => setForm({ ...form, ageMin: e.target.value })} />
                </div>
                <div>
                  <label className="label">Max age</label>
                  <input className="input" type="number" min={13} max={100} value={form.ageMax ?? ""} onChange={(e) => setForm({ ...form, ageMax: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Genders (comma-separated)</label>
                <input className="input" value={form.genders ?? ""} onChange={(e) => setForm({ ...form, genders: e.target.value })} placeholder="all, male, female" />
              </div>
              <div>
                <label className="label">Interests (comma-separated)</label>
                <input className="input" value={form.interests ?? ""} onChange={(e) => setForm({ ...form, interests: e.target.value })} placeholder="B2B software, entrepreneurship" />
              </div>
              <div>
                <label className="label">Keywords (comma-separated, Google Ads)</label>
                <input className="input" value={form.keywords ?? ""} onChange={(e) => setForm({ ...form, keywords: e.target.value })} placeholder="lead generation software" />
              </div>
            </div>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-4">Creative</h2>
            <div className="space-y-3">
              <div>
                <label className="label">Headline</label>
                <input className="input" value={form.headline ?? ""} onChange={(e) => setForm({ ...form, headline: e.target.value })} placeholder="Find qualified leads faster" />
              </div>
              <div>
                <label className="label">Primary text</label>
                <textarea className="input" rows={3} value={form.primaryText ?? ""} onChange={(e) => setForm({ ...form, primaryText: e.target.value })} />
              </div>
              <div>
                <label className="label">Destination URL</label>
                <input className="input" type="url" value={form.destinationUrl ?? ""} onChange={(e) => setForm({ ...form, destinationUrl: e.target.value })} placeholder="https://example.com/demo" />
              </div>
              <div>
                <label className="label">Image URL</label>
                <input className="input" type="url" value={form.imageUrl ?? ""} onChange={(e) => setForm({ ...form, imageUrl: e.target.value })} placeholder="https://example.com/ad-creative.png" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="card p-6">
            <h2 className="font-semibold mb-2">Status</h2>
            <StatusBadge status={campaign.status} />
            <p className="text-xs text-slate-500 mt-3">
              {campaign.launchedAt
                ? `First launched ${new Date(campaign.launchedAt).toLocaleString()}`
                : "Not launched yet."}
            </p>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold mb-2">Performance</h2>
            {campaign.metrics.length === 0 ? (
              <EmptyState
                title="No performance data yet"
                subtitle="This populates once a real ad-platform reporting connection is wired in — nothing here is estimated or made up."
              />
            ) : (
              <div className="space-y-2 text-sm">
                {campaign.metrics.map((m) => (
                  <div key={m.id} className="flex items-center justify-between border-b border-slate-100 pb-2 last:border-0">
                    <span className="text-slate-500">{new Date(m.date).toLocaleDateString()}</span>
                    <span>
                      {m.impressions.toLocaleString()} impr · {m.clicks} clicks · {m.leads} leads · ${m.spend}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
