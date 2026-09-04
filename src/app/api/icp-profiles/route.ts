import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";

const createSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  industries: z.array(z.string()).optional(),
  companySizeMin: z.number().int().min(0).optional(),
  companySizeMax: z.number().int().min(0).optional(),
  jobTitles: z.array(z.string()).optional(),
  geographies: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  exclusions: z.string().optional(),
});

export async function GET() {
  try {
    const session = await requireOrgSession();
    const icpProfiles = await prisma.icpProfile.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { leads: true, discoveryRuns: true } },
        discoveryRuns: { orderBy: { startedAt: "desc" }, take: 1 },
      },
    });
    return json({ icpProfiles });
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
    const icpProfile = await prisma.icpProfile.create({
      data: { orgId: session.orgId, ...parsed.data },
    });
    return json({ icpProfile }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
