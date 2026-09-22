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
  video: { mimeType: string; sizeBytes: number } | null;
}

const MAX_VIDEO_BYTES = 5 * 1024 * 1024;

function formatBytes(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function domainOf(url: string | null): string {
  if (!url) return "example.com";
  try {
    return new URL(url).hostname;
  } catch {
    return "example.com";
  }
}

interface CopyOverride {
  headline: string;
  primaryText: string;
  cta: string;
}

interface PreviewProps {
  campaign: AdCampaign;
  campaignId: string;
  videoBust: number;
  override?: CopyOverride | null;
}

/** Rough approximation of a Google ad — not pixel-accurate, just enough to sanity-check copy and creative before launch. */
function GoogleAdsPreview({ campaign, campaignId, videoBust, override }: PreviewProps) {
  const headline = override?.headline || campaign.headline;
  const primaryText = override?.primaryText || campaign.primaryText;
  const cta = override?.cta || "Visit site";
  const hasMedia = !!campaign.video || !!campaign.imageUrl;
  return (
    <div className="space-y-3">
      <div className="border border-slate-200 rounded-lg p-4 bg-white">
        <div className="flex items-center gap-1.5 text-xs text-slate-600">
          <span className="font-bold text-[11px] border border-slate-400 rounded px-1 leading-4">Ad</span>
          <span>{domainOf(campaign.destinationUrl)}</span>
        </div>
        <div className="text-[#1a0dab] text-lg leading-snug mt-1">{headline || "Your headline goes here"}</div>
        <p className="text-sm text-slate-600 mt-1">
          {primaryText || "Your ad description will appear here once you add primary text."}
        </p>
      </div>
      {hasMedia && (
        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white">
          <div className="aspect-video bg-slate-100 flex items-center justify-center overflow-hidden">
            {campaign.video ? (
              <video className="w-full h-full object-cover" controls src={`/api/ad-campaigns/${campaignId}/video?v=${videoBust}`} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={campaign.imageUrl!} alt="" className="w-full h-full object-cover" />
            )}
          </div>
          <div className="px-3 py-2 flex items-center justify-between gap-2">
            <div className="text-xs text-slate-500 truncate">{domainOf(campaign.destinationUrl)}</div>
            <span className="text-xs font-semibold text-white bg-[#1a73e8] rounded px-2 py-1 shrink-0">{cta}</span>
          </div>
          <p className="text-[10px] text-slate-400 px-3 pb-2">
            Display/video ad preview — shown because this campaign has a video or image (Google Display/Video, not classic text Search).
          </p>
        </div>
      )}
    </div>
  );
}

/** Rough approximation of an Instagram feed ad — not pixel-accurate, just enough to sanity-check the creative before launch. */
function InstagramAdsPreview({ campaign, campaignId, videoBust, override }: PreviewProps) {
  const headline = override?.headline || campaign.headline;
  const primaryText = override?.primaryText || campaign.primaryText;
  const cta = override?.cta || "Learn more";
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-400 to-pink-500 shrink-0" />
        <div className="text-sm font-semibold">Your Org</div>
        <span className="text-xs text-slate-400 ml-auto">Sponsored</span>
      </div>
      <div className="aspect-square bg-slate-100 flex items-center justify-center overflow-hidden">
        {campaign.video ? (
          <video className="w-full h-full object-cover" controls src={`/api/ad-campaigns/${campaignId}/video?v=${videoBust}`} />
        ) : campaign.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={campaign.imageUrl} alt="" className="w-full h-full object-cover" />
        ) : (
          <span className="text-xs text-slate-400 px-4 text-center">No image or video uploaded yet</span>
        )}
      </div>
      <div className="px-3 py-2 space-y-1">
        <p className="text-sm">
          <span className="font-semibold">Your Org</span> {primaryText || "Your primary text will appear here."}
        </p>
        {headline && (
          <div className="flex items-center justify-between border-t border-slate-100 pt-2 mt-1 gap-2">
            <div className="min-w-0">
              <div className="text-xs text-slate-400 uppercase truncate">{domainOf(campaign.destinationUrl)}</div>
              <div className="text-sm font-medium truncate">{headline}</div>
            </div>
            <span className="text-xs font-semibold text-blue-600 border border-blue-200 rounded px-2 py-1 shrink-0">
              {cta}
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
  const [videoBust, setVideoBust] = useState(0);
  const [videoUploading, setVideoUploading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [aiPreview, setAiPreview] = useState<CopyOverride | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

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

  async function uploadVideo(file: File) {
    setVideoError(null);
    if (!file.type.startsWith("video/")) {
      setVideoError("File must be a video");
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      setVideoError(`Video must be ${formatBytes(MAX_VIDEO_BYTES)} or smaller (this one is ${formatBytes(file.size)})`);
      return;
    }
    setVideoUploading(true);
    const body = new FormData();
    body.append("video", file);
    const res = await fetch(`/api/ad-campaigns/${params.id}/video`, { method: "POST", body });
    setVideoUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setVideoError(data.error ?? "Failed to upload video");
      return;
    }
    setVideoBust((n) => n + 1);
    load();
  }

  async function removeVideo() {
    setVideoUploading(true);
    const res = await fetch(`/api/ad-campaigns/${params.id}/video`, { method: "DELETE" });
    setVideoUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setVideoError(data.error ?? "Failed to remove video");
      return;
    }
    setVideoBust((n) => n + 1);
    load();
  }

  async function generateAiPreview() {
    setAiLoading(true);
    setAiError(null);
    const res = await fetch(`/api/ad-campaigns/${params.id}/ai-preview`, { method: "POST" });
    setAiLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setAiError(data.error ?? "Failed to generate AI preview");
      return;
    }
    const data = await res.json();
    setAiPreview(data.preview);
  }

  function applyAiPreview() {
    if (!aiPreview) return;
    setForm({ ...form, headline: aiPreview.headline, primaryText: aiPreview.primaryText });
    setAiPreview(null);
    setMessage("AI copy applied to the form below — click Save to keep it.");
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
              <div>
                <label className="label">Video (optional, max {formatBytes(MAX_VIDEO_BYTES)})</label>
                {videoError && <p className="text-xs text-red-600 mb-1">{videoError}</p>}
                {campaign.video ? (
                  <div className="space-y-2">
                    <video
                      controls
                      className="w-full max-h-64 rounded-lg bg-black"
                      src={`/api/ad-campaigns/${params.id}/video?v=${videoBust}`}
                    />
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{campaign.video.mimeType} · {formatBytes(campaign.video.sizeBytes)}</span>
                      <button
                        type="button"
                        className="text-red-600 font-medium hover:underline"
                        disabled={videoUploading}
                        onClick={removeVideo}
                      >
                        Remove video
                      </button>
                    </div>
                  </div>
                ) : (
                  <input
                    className="input"
                    type="file"
                    accept="video/*"
                    disabled={videoUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) uploadVideo(file);
                      e.target.value = "";
                    }}
                  />
                )}
                {videoUploading && <p className="text-xs text-slate-400 mt-1">Uploading…</p>}
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
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Preview</h2>
              <button className="btn-secondary text-xs !py-1" disabled={aiLoading} onClick={generateAiPreview}>
                {aiLoading ? "Generating…" : "✨ Generate with AI"}
              </button>
            </div>
            {aiError && <p className="text-xs text-red-600 mb-2">{aiError}</p>}
            {aiPreview && (
              <div className="flex items-center justify-between text-xs bg-brand-50 border border-brand-200 text-brand-700 rounded-lg px-3 py-2 mb-2">
                <span>AI-suggested copy shown below — nothing&apos;s saved yet.</span>
                <div className="flex items-center gap-2 shrink-0">
                  <button className="font-medium hover:underline" onClick={applyAiPreview}>
                    Use this
                  </button>
                  <button className="text-slate-500 hover:underline" onClick={() => setAiPreview(null)}>
                    Discard
                  </button>
                </div>
              </div>
            )}
            {campaign.platform === "google_ads" ? (
              <GoogleAdsPreview campaign={campaign} campaignId={campaign.id} videoBust={videoBust} override={aiPreview} />
            ) : (
              <InstagramAdsPreview campaign={campaign} campaignId={campaign.id} videoBust={videoBust} override={aiPreview} />
            )}
            <p className="text-xs text-slate-400 mt-3">
              Approximate — real rendering varies by device and placement. The base preview reflects what&apos;s saved
              (click Save above after editing to update it); &quot;Generate with AI&quot; asks Gemini for a polished
              take on top of that, as a suggestion you choose whether to apply.
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
