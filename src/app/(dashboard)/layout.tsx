import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Sidebar } from "@/components/Sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const [org, user] = await Promise.all([
    prisma.organization.findUnique({ where: { id: session.orgId } }),
    prisma.user.findUnique({ where: { id: session.userId } }),
  ]);

  if (!org || !user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar orgName={org.name} userName={user.name} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
