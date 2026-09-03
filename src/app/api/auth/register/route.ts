import { z } from "zod";
import { prisma } from "@/lib/db";
import { hashPassword, createSessionToken, setSessionCookie } from "@/lib/auth";
import { json, errorResponse } from "@/lib/api";

const schema = z.object({
  orgName: z.string().min(2).max(200),
  name: z.string().min(1).max(200),
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Invalid input", 422);
  }
  const { orgName, name, email, password } = parsed.data;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return errorResponse("An account with this email already exists", 409);
  }

  const passwordHash = await hashPassword(password);

  const { user, org } = await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: orgName } });
    const user = await tx.user.create({
      data: {
        orgId: org.id,
        email,
        passwordHash,
        name,
        role: "owner",
      },
    });
    return { user, org };
  });

  const token = await createSessionToken({ userId: user.id, orgId: org.id, role: user.role });
  await setSessionCookie(token);

  return json({ user: { id: user.id, email: user.email, name: user.name }, org: { id: org.id, name: org.name } }, 201);
}
