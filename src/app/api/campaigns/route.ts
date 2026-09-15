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
      include: { sequences: { include: { _count: { select: { enrollments: true } } } } },
    });
    // Enrollment counts are cheap to fold in here (single query, no N+1) so the
    // list page can show "N enrolled" per campaign without a separate round trip.
    const withStats = campaigns.map((c) => ({
      ...c,
      totalEnrolled: c.sequences.reduce((sum, s) => sum + s._count.enrollments, 0),
    }));
    return json({ campaigns: withStats });
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
