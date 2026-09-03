import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  goal: z.string().optional(),
  status: z.enum(["draft", "active", "paused", "archived"]).default("draft"),
});

export async function GET() {
  try {
    const session = await requireOrgSession();
    const campaigns = await prisma.campaign.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "desc" },
      include: { sequences: true },
    });
    return json({ campaigns });
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
    const campaign = await prisma.campaign.create({ data: { orgId: session.orgId, ...parsed.data } });
    return json({ campaign }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
