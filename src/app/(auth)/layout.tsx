import { AuthBackground } from "@/components/AuthBackground";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen flex items-center justify-center bg-slate-50 px-4 overflow-hidden">
      <AuthBackground />
      <div className="relative w-full max-w-sm">{children}</div>
    </div>
  );
}
