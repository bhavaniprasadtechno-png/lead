"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FadeIn, motion } from "@/components/motion";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Login failed");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FadeIn y={-10} className="text-center mb-8">
        <div className="text-2xl font-bold brand-wordmark">LeadPilot</div>
        <p className="text-slate-500 text-sm mt-1">AI-powered lead generation &amp; management</p>
      </FadeIn>
      <motion.form
        onSubmit={onSubmit}
        className="card p-6 space-y-4"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-lg font-semibold">Sign in</h1>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Signing in…" : "Sign in"}
        </button>
        <p className="text-sm text-slate-500 text-center">
          No account? <Link href="/register" className="text-brand-600 font-medium">Create one</Link>
        </p>
      </motion.form>
      <FadeIn delay={0.2}>
        <p className="text-xs text-slate-400 text-center mt-4">
          Demo credentials: demo@leadpilot.ai / demo12345 (after seeding)
        </p>
      </FadeIn>
    </>
  );
}
