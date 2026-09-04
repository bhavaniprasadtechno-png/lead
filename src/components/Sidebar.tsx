"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/leads", label: "Leads", icon: "👤" },
  { href: "/icp", label: "ICP Search", icon: "🔍" },
  { href: "/pipeline", label: "Pipeline", icon: "🧭" },
  { href: "/campaigns", label: "Campaigns", icon: "📣" },
  { href: "/templates", label: "Templates", icon: "✉️" },
  { href: "/agents", label: "AI Agents", icon: "🤖" },
  { href: "/approvals", label: "Approvals", icon: "✅" },
  { href: "/settings/integrations", label: "Integrations", icon: "🔌" },
];

export function Sidebar({ orgName, userName }: { orgName: string; userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-60 shrink-0 border-r border-slate-200 bg-white flex flex-col h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-slate-200">
        <div className="text-lg font-bold text-brand-600">LeadPilot</div>
        <div className="text-xs text-slate-500 truncate">{orgName}</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-slate-200">
        <div className="text-sm text-slate-700 truncate px-3">{userName}</div>
        <button onClick={logout} className="mt-2 w-full text-left text-sm text-slate-500 hover:text-red-600 px-3 py-1">
          Sign out
        </button>
      </div>
    </aside>
  );
}
