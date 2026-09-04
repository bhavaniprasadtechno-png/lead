"use client";

import { useEffect, useState, useCallback } from "react";
import { PageHeader } from "@/components/ui";

interface Integration {
  id: string;
  provider: string;
  status: string;
  connectedAt: string | null;
}

const PROVIDERS: { id: string; label: string; description: string }[] = [
  { id: "n8n", label: "n8n", description: "Orchestration layer running the AI agent workflows" },
  { id: "openrouter", label: "OpenRouter", description: "Scoring, personalization, and intent classification (currently NVIDIA Nemotron 3 Ultra)" },
  { id: "apollo", label: "Apollo.io", description: "Company & contact enrichment" },
  { id: "clearbit", label: "Clearbit", description: "Company & contact enrichment (alternative)" },
  { id: "postmark", label: "Postmark", description: "Transactional & sequence email sending" },
  { id: "sendgrid", label: "SendGrid", description: "Alternative email sending provider" },
  { id: "gmail", label: "Gmail", description: "Reply capture & threading" },
  { id: "cal_com", label: "Cal.com", description: "Meeting scheduling" },
];

export default function IntegrationsPage() {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [webhookSecret, setWebhookSecret] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/integrations");
    const data = await res.json();
    setIntegrations(data.integrations ?? []);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function statusFor(provider: string) {
    return integrations.find((i) => i.provider === provider)?.status ?? "disconnected";
  }

  async function connect(provider: string) {
    await fetch("/api/integrations", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, status: "connected", credentialRef: webhookSecret || undefined }),
    });
    load();
  }

  return (
    <div>
      <PageHeader
        title="Integrations"
        subtitle="Connect the external services n8n agent workflows use. Credentials are stored in n8n's own credential store — this just tracks connection status."
      />
      <div className="p-8 space-y-4">
        <div className="card p-5">
          <h2 className="font-semibold mb-2">n8n webhook contract</h2>
          <p className="text-sm text-slate-500 mb-3">
            Set <code>N8N_WEBHOOK_BASE_URL</code> and <code>N8N_WEBHOOK_SECRET</code> in the app&apos;s environment, and
            configure the same secret in your n8n HTTP Request nodes (see <code>/n8n-workflows</code> in the repo) so
            every call is HMAC-signed in both directions.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {PROVIDERS.map((p) => {
            const status = statusFor(p.id);
            return (
              <div key={p.id} className="card p-5 flex items-center justify-between">
                <div>
                  <div className="font-medium">{p.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{p.description}</div>
                </div>
                <button
                  onClick={() => connect(p.id)}
                  className={`badge cursor-pointer ${status === "connected" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-500"}`}
                >
                  {status}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
