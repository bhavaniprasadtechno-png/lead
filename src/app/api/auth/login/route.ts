import { z } from "zod";
import { prisma } from "@/lib/db";
import { verifyPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { json, errorResponse } from "@/lib/api";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("Invalid email or password", 422);
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    return errorResponse("Invalid email or password", 401);
  }

  const token = await createSessionToken({ userId: user.id, orgId: user.orgId, role: user.role });
  await setSessionCookie(token);

  return json({ user: { id: user.id, email: user.email, name: user.name } });
}
