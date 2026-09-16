"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";

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
    <aside className="w-60 shrink-0 bg-ink-950 flex flex-col h-screen sticky top-0 text-slate-300">
      <div className="px-5 py-5 border-b border-white/10">
        <motion.div
          className="text-lg font-bold brand-wordmark inline-block"
          whileHover={{ scale: 1.04 }}
          transition={{ type: "spring", stiffness: 400, damping: 15 }}
        >
          LeadPilot
        </motion.div>
        <div className="text-xs text-slate-500 truncate">{orgName}</div>
      </div>
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV.map((item, i) => {
          const active = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                href={item.href}
                className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-200 ${
                  active ? "text-white" : "text-slate-400 hover:text-slate-100 hover:bg-white/5"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="sidebar-active"
                    className="absolute inset-0 rounded-lg bg-brand-gradient shadow-lg shadow-brand-900/40"
                    transition={{ type: "spring", stiffness: 500, damping: 38 }}
                  />
                )}
                <span className="relative">
                  <motion.span whileHover={{ scale: 1.15 }} className="inline-block">
                    {item.icon}
                  </motion.span>
                </span>
                <span className="relative">{item.label}</span>
              </Link>
            </motion.div>
          );
        })}
      </nav>
      <div className="px-3 py-4 border-t border-white/10">
        <div className="text-sm text-slate-300 truncate px-3">{userName}</div>
        <button onClick={logout} className="mt-2 w-full text-left text-sm text-slate-500 hover:text-accent-400 px-3 py-1 transition-colors duration-200">
          Sign out
        </button>
      </div>
    </aside>
  );
}
