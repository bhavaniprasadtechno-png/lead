"use client";

import { FadeIn, TiltCard, AnimatedNumber, ModalTransition, motion } from "@/components/motion";

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <FadeIn y={-8}>
      <div className="flex items-start justify-between px-8 py-6 border-b border-slate-200 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
          {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </FadeIn>
  );
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-slate-100 text-slate-700",
  enriching: "bg-indigo-100 text-indigo-700",
  scoring: "bg-indigo-100 text-indigo-700",
  qualified: "bg-emerald-100 text-emerald-700",
  disqualified: "bg-slate-200 text-slate-500",
  contacted: "bg-blue-100 text-blue-700",
  engaged: "bg-amber-100 text-amber-700",
  meeting_booked: "bg-purple-100 text-purple-700",
  won: "bg-green-100 text-green-700",
  lost: "bg-red-100 text-red-700",
  // Campaign statuses
  draft: "bg-slate-100 text-slate-600",
  active: "bg-emerald-100 text-emerald-700",
  paused: "bg-amber-100 text-amber-700",
  archived: "bg-slate-200 text-slate-500",
  // Sequence enrollment statuses (derived client/server-side, not a DB enum)
  completed: "bg-blue-100 text-blue-700",
  stopped: "bg-red-100 text-red-700",
  // Reply intent classifications (Agent 4)
  interested: "bg-emerald-100 text-emerald-700",
  objection: "bg-amber-100 text-amber-700",
  not_interested: "bg-red-100 text-red-700",
  out_of_office: "bg-slate-100 text-slate-600",
  unsubscribe: "bg-red-100 text-red-700",
  needs_info: "bg-indigo-100 text-indigo-700",
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.85 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`badge ${STATUS_STYLES[status] ?? "bg-slate-100 text-slate-700"}`}
    >
      {status.replace(/_/g, " ")}
    </motion.span>
  );
}

export function ScoreBadge({ score }: { score: number | null | undefined }) {
  if (score === null || score === undefined) {
    return <span className="badge bg-slate-100 text-slate-400">—</span>;
  }
  const color = score >= 60 ? "bg-emerald-100 text-emerald-700" : score >= 40 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700";
  return <span className={`badge ${color}`}>{score}</span>;
}

export function EmptyState({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <FadeIn className="text-center py-16 text-slate-400">
      <p className="font-medium">{title}</p>
      {subtitle && <p className="text-sm mt-1">{subtitle}</p>}
    </FadeIn>
  );
}

/** Shared modal shell — replaces the hand-rolled overlay markup that used to be duplicated in every form. */
export function Modal({
  title,
  onClose,
  children,
  maxWidth = "max-w-md",
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
}) {
  return (
    <ModalTransition>
      <div className={`card w-full ${maxWidth} p-6 max-h-[85vh] overflow-y-auto`}>
        <h2 className="font-semibold text-lg mb-4">{title}</h2>
        {children}
      </div>
    </ModalTransition>
  );
}

/** Simple underline tab bar for organizing a dense detail page into sections. */
export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: readonly { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex items-center gap-1 border-b border-slate-200 relative">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`relative px-4 py-2.5 text-sm font-medium -mb-px transition-colors duration-200 ${
            active === tab.id ? "text-brand-600" : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {tab.label}
          {active === tab.id && (
            <motion.div
              layoutId="tab-underline"
              className="absolute left-0 right-0 -bottom-px h-0.5 bg-brand-500"
              transition={{ type: "spring", stiffness: 500, damping: 35 }}
            />
          )}
        </button>
      ))}
    </div>
  );
}

/** Small labeled number tile — the "stat tile" pattern used across the dashboard, with a 3D hover tilt and a count-up entrance. */
export function StatTile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  const numeric = typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value));
  return (
    <TiltCard className="card p-4 card-hover">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="text-2xl font-semibold mt-1">
        {numeric ? <AnimatedNumber value={Number(value)} /> : value}
      </div>
      {hint && <div className="text-xs text-slate-400 mt-0.5">{hint}</div>}
    </TiltCard>
  );
}
