import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";
import { AD_OBJECTIVES } from "@/lib/constants";

const targetingSchema = z
  .object({
    geographies: z.array(z.string()).optional(),
    ageMin: z.number().int().min(13).max(100).optional(),
    ageMax: z.number().int().min(13).max(100).optional(),
    genders: z.array(z.string()).optional(),
    interests: z.array(z.string()).optional(),
    keywords: z.array(z.string()).optional(),
  })
  .optional();

const createSchema = z.object({
  name: z.string().min(1),
  platform: z.enum(["google_ads", "instagram_ads"]),
  objective: z.enum(AD_OBJECTIVES).default("leads"),
  dailyBudget: z.number().positive().optional(),
  totalBudget: z.number().positive().optional(),
  currency: z.string().min(1).default("USD"),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  targeting: targetingSchema,
  headline: z.string().optional(),
  primaryText: z.string().optional(),
  destinationUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
});

/** GET /api/ad-campaigns — list this org's ad campaigns with lifetime metric totals folded in. */
export async function GET() {
  try {
    const session = await requireOrgSession();
    const campaigns = await prisma.adCampaign.findMany({
      where: { orgId: session.orgId },
      orderBy: { createdAt: "desc" },
      include: { metrics: true },
    });
    const adCampaigns = campaigns.map(({ metrics, ...c }) => ({
      ...c,
      totals: metrics.reduce(
        (acc, m) => ({
          impressions: acc.impressions + m.impressions,
          clicks: acc.clicks + m.clicks,
          spend: acc.spend + Number(m.spend),
          leads: acc.leads + m.leads,
        }),
        { impressions: 0, clicks: 0, spend: 0, leads: 0 },
      ),
    }));
    return json({ adCampaigns });
  } catch (err) {
    return handleApiError(err);
  }
}

/** POST /api/ad-campaigns — create a new ad campaign, always starting as a draft. */
export async function POST(req: Request) {
  try {
    const session = await requireOrgSession();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const { startDate, endDate, ...data } = parsed.data;
    const adCampaign = await prisma.adCampaign.create({
      data: {
        orgId: session.orgId,
        ...data,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      },
    });
    return json({ adCampaign }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
