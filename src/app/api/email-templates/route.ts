import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  subject: z.string().min(1),
  bodyPrompt: z.string().min(1),
  tone: z.string().default("professional"),
  variables: z.record(z.string(), z.any()).optional(),
});

export async function GET() {
  try {
    const session = await requireOrgSession();
    const templates = await prisma.emailTemplate.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "desc" },
    });
    return json({ templates });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireOrgSession();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const template = await prisma.emailTemplate.create({ data: { orgId: session.orgId, ...parsed.data } });
    return json({ template }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
