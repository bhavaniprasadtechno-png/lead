"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader, EmptyState, StatusBadge, Modal } from "@/components/ui";
import { AD_PLATFORMS, AD_OBJECTIVES, AD_CAMPAIGN_STATUSES } from "@/lib/constants";

interface Integration {
  provider: string;
  status: string;
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
  totals: { impressions: number; clicks: number; spend: number; leads: number };
}

function platformLabel(value: string) {
  return AD_PLATFORMS.find((p) => p.value === value)?.label ?? value;
}

function formatMoney(amount: string | null, currency: string) {
  if (amount === null) return "No budget set";
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(Number(amount));
}

export default function AdsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [campaigns, setCampaigns] = useState<AdCampaign[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showModal, setShowModal] = useState(false);

  const load = useCallback(async () => {
    const [intRes, campRes] = await Promise.all([fetch("/api/integrations"), fetch("/api/ad-campaigns")]);
    const intData = await intRes.json();
    const campData = await campRes.json();
    setIntegrations(intData.integrations ?? []);
    setCampaigns(campData.adCampaigns ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function statusFor(provider: string) {
    return integrations.find((i) => i.provider === provider)?.status ?? "disconnected";
  }

  async function togglePlatform(provider: string) {
    const status = statusFor(provider) === "connected" ? "disconnected" : "connected";
    await fetch("/api/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, status }),
    });
    load();
  }

  async function setStatus(id: string, status: string) {
    const prev = campaigns;
    setCampaigns((cs) => cs.map((c) => (c.id === id ? { ...c, status } : c)));
    const res = await fetch(`/api/ad-campaigns/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      setCampaigns(prev);
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Failed to update status");
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this ad campaign? This can't be undone.")) return;
    const prev = campaigns;
    setCampaigns((cs) => cs.filter((c) => c.id !== id));
    const res = await fetch(`/api/ad-campaigns/${id}`, { method: "DELETE" });
    if (!res.ok) setCampaigns(prev);
  }

  return (
    <div>
      <PageHeader
        title="Ads"
        subtitle="Run Google Ads and Instagram Ads campaigns alongside your email outreach"
        actions={
          <button className="btn-primary" onClick={() => setShowModal(true)}>
            + New ad campaign
          </button>
        }
      />
      <div className="p-8 space-y-6">
        <div>
          <h2 className="font-semibold mb-3">Connected platforms</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {AD_PLATFORMS.map((p) => {
              const status = statusFor(p.value);
              return (
                <div key={p.value} className="card p-5 flex items-center justify-between">
                  <div>
                    <div className="font-medium">{p.label}</div>
                    <div className="text-xs text-slate-500 mt-0.5">
                      {status === "connected"
                        ? "Connected — campaigns on this platform can be launched"
                        : "Not connected — connect before launching a campaign"}
                    </div>
                  </div>
                  <button
                    onClick={() => togglePlatform(p.value)}
                    title={status === "connected" ? "Click to disconnect" : "Click to connect"}
                    className={`badge cursor-pointer ${status === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}
                  >
                    {status}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="font-semibold mb-3">Ad campaigns</h2>
          {loaded && campaigns.length === 0 ? (
            <EmptyState
              title="No ad campaigns yet"
              subtitle="Connect a platform above, then create a campaign to configure targeting, creative, and budget."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {campaigns.map((c) => (
                <div key={c.id} className="card p-5 flex flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/ads/${c.id}`} className="font-semibold hover:text-brand-600">
                      {c.name}
                    </Link>
                    <select
                      className="input !w-auto !py-1 text-xs cursor-pointer"
                      value={c.status}
                      onChange={(e) => setStatus(c.id, e.target.value)}
                    >
                      {AD_CAMPAIGN_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-sm text-slate-500 mt-1">
                    {platformLabel(c.platform)} · {c.objective}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <StatusBadge status={c.status} />
                    <span className="text-xs text-slate-400">{formatMoney(c.dailyBudget, c.currency)}/day</span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
                    <span>
                      {c.totals.impressions.toLocaleString()} impr · {c.totals.clicks.toLocaleString()} clicks ·{" "}
                      {c.totals.leads} lead(s)
                    </span>
                    <button className="text-red-600 font-medium hover:underline" onClick={() => remove(c.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {showModal && <NewAdCampaignModal onClose={() => setShowModal(false)} onCreated={load} />}
    </div>
  );
}

function NewAdCampaignModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<string>(AD_PLATFORMS[0].value);
  const [objective, setObjective] = useState<string>("leads");
  const [dailyBudget, setDailyBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ad-campaigns", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name,
          platform,
          objective,
          dailyBudget: dailyBudget ? Number(dailyBudget) : undefined,
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Failed to create ad campaign");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ad campaign");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="New ad campaign" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="label">Name</label>
          <input className="input" required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Spring demo signups" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Platform</label>
            <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
              {AD_PLATFORMS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Objective</label>
            <select className="input" value={objective} onChange={(e) => setObjective(e.target.value)}>
              {AD_OBJECTIVES.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="label">Daily budget (USD, optional)</label>
          <input
            className="input"
            type="number"
            min={0}
            step="0.01"
            value={dailyBudget}
            onChange={(e) => setDailyBudget(e.target.value)}
            placeholder="50"
          />
        </div>
        <p className="text-xs text-slate-400">
          Starts as a draft. Set targeting, creative, and launch from the campaign page.
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
