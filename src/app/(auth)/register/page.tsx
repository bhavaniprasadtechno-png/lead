"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FadeIn, motion } from "@/components/motion";

export default function RegisterPage() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ orgName, name, email, password }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Registration failed");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <FadeIn y={-10} className="text-center mb-8">
        <div className="text-2xl font-bold brand-wordmark">LeadPilot</div>
        <p className="text-slate-500 text-sm mt-1">Create your organization</p>
      </FadeIn>
      <motion.form
        onSubmit={onSubmit}
        className="card p-6 space-y-4"
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
      >
        <h1 className="text-lg font-semibold">Create account</h1>
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
        <div>
          <label className="label">Company / organization name</label>
          <input className="input" required value={orgName} onChange={(e) => setOrgName(e.target.value)} placeholder="Acme Inc." />
        </div>
        <div>
          <label className="label">Your name</label>
          <input className="input" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Smith" />
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </div>
        <div>
          <label className="label">Password</label>
          <input className="input" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Creating…" : "Create account"}
        </button>
        <p className="text-sm text-slate-500 text-center">
          Already have an account? <Link href="/login" className="text-brand-600 font-medium">Sign in</Link>
        </p>
      </motion.form>
    </>
  );
}
