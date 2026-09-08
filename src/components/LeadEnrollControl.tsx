"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface SequenceOption {
  id: string;
  name: string;
  campaignName: string;
}

export function LeadEnrollControl({ leadId }: { leadId: string }) {
  const router = useRouter();
  const [options, setOptions] = useState<SequenceOption[]>([]);
  const [selected, setSelected] = useState("");
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch("/api/campaigns")
      .then((res) => res.json())
      .then((data) => {
        const campaigns = (data.campaigns ?? []) as {
          id: string;
          name: string;
          status: string;
          sequences: { id: string; name: string }[];
        }[];
        const flat = campaigns
          .filter((c) => c.status === "active")
          .flatMap((c) => c.sequences.map((s) => ({ id: s.id, name: s.name, campaignName: c.name })));
        setOptions(flat);
        setSelected(flat[0]?.id ?? "");
      });
  }, [open]);

  async function enroll() {
    if (!selected) return;
    setSaving(true);
    await fetch(`/api/leads/${leadId}/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sequenceId: selected }),
    });
    setSaving(false);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn-secondary" onClick={() => setOpen(true)}>
        + Enroll in sequence
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {options.length === 0 ? (
        <span className="text-sm text-slate-400">No active campaigns with sequences</span>
      ) : (
        <select className="input max-w-[220px]" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.campaignName} — {o.name}
            </option>
          ))}
        </select>
      )}
      <button className="btn-primary" disabled={saving || !selected} onClick={enroll}>
        {saving ? "Enrolling…" : "Enroll"}
      </button>
      <button className="btn-secondary" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </div>
  );
}
