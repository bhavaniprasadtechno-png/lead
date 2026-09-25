"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { PageHeader, EmptyState, StatusBadge } from "@/components/ui";
import { leadDisplayName } from "@/lib/format";

interface Meeting {
  id: string;
  createdAt: string;
  bookingLink: string | null;
  subject: string | null;
  body: string | null;
  lead: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    company: string | null;
    jobTitle: string | null;
    status: string;
  };
}

export default function MeetingsPage() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/meetings");
    const data = await res.json();
    setMeetings(data.meetings ?? []);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <PageHeader
        title="Meetings"
        subtitle="Meetings the Scheduler agent has proposed to leads — tracks the booking email sent, not a confirmed calendar event (Cal.com's own booking-confirmed webhook isn't wired in yet, so treat status here as 'offered', not 'locked in')"
      />
      <div className="p-8">
        {loaded && meetings.length === 0 ? (
          <EmptyState
            title="No meetings proposed yet"
            subtitle="Once a lead replies interested, Agent 5 drafts a booking email — it'll show up here."
          />
        ) : (
          <div className="space-y-4">
            {meetings.map((m) => (
              <div key={m.id} className="card p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <Link href={`/leads/${m.lead.id}`} className="font-semibold hover:text-brand-600">
                      {leadDisplayName(m.lead)}
                    </Link>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {[m.lead.jobTitle, m.lead.company].filter(Boolean).join(" at ") || m.lead.email || "No contact details"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={m.lead.status} />
                    <span className="text-xs text-slate-400">{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                </div>
                {m.subject && <p className="text-sm font-medium mt-3">{m.subject}</p>}
                {m.body && <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{m.body}</p>}
                {m.bookingLink && (
                  <a
                    href={m.bookingLink}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-block mt-3 text-sm font-medium text-brand-600 hover:underline"
                  >
                    View booking page →
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
