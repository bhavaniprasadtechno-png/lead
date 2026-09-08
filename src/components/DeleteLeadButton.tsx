"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeleteLeadButton({ leadId, redirectTo }: { leadId: string; redirectTo?: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    if (!confirm("Delete this lead? This removes its activity, enrichment, and sequence history too.")) return;
    setDeleting(true);
    await fetch(`/api/leads/${leadId}`, { method: "DELETE" });
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.refresh();
    }
  }

  return (
    <button className="btn-danger" disabled={deleting} onClick={remove}>
      {deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
