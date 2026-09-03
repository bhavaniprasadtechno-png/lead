import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { json } from "@/lib/api";

export async function GET() {
  const session = await getSession();
  if (!session) return json({ user: null });

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true, role: true, orgId: true },
  });
  return json({ user });
}
