"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LEAD_STATUSES } from "@/lib/constants";

export function LeadStatusControl({
  leadId,
  status,
  score,
}: {
  leadId: string;
  status: string;
  score: number | null;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState(status);
  const [saving, setSaving] = useState(false);

  async function update(newStatus: string) {
    setSaving(true);
    setCurrent(newStatus);
    await fetch(`/api/leads/${leadId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {score !== null && <span className="text-sm text-slate-500">Score {score}</span>}
      <select
        className="input max-w-[180px]"
        value={current}
        disabled={saving}
        onChange={(e) => update(e.target.value)}
      >
        {LEAD_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s.replace(/_/g, " ")}
          </option>
        ))}
      </select>
    </div>
  );
}
