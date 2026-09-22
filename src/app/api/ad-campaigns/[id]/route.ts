import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { AD_OBJECTIVES, AD_CAMPAIGN_STATUSES } from "@/lib/constants";

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

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  objective: z.enum(AD_OBJECTIVES).optional(),
  status: z.enum(AD_CAMPAIGN_STATUSES).optional(),
  dailyBudget: z.number().positive().nullable().optional(),
  totalBudget: z.number().positive().nullable().optional(),
  currency: z.string().min(1).optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
  targeting: targetingSchema,
  headline: z.string().nullable().optional(),
  primaryText: z.string().nullable().optional(),
  destinationUrl: z.string().url().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
});

async function loadAdCampaign(orgId: string, id: string) {
  const adCampaign = await prisma.adCampaign.findFirst({
    where: { id, orgId },
    include: {
      metrics: { orderBy: { date: "desc" } },
      // Metadata only — never select `data` here, it's the raw video bytes
      // and this campaign's detail response would otherwise carry them on
      // every load. GET /api/ad-campaigns/:id/video serves the bytes.
      video: { select: { mimeType: true, sizeBytes: true } },
    },
  });
  if (!adCampaign) throw new ApiError("Ad campaign not found", 404);
  return adCampaign;
}

/** GET /api/ad-campaigns/:id — detail, metrics history, and whether the campaign's platform is connected. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const adCampaign = await loadAdCampaign(session.orgId, id);
    const integration = await prisma.integration.findUnique({
      where: { orgId_provider: { orgId: session.orgId, provider: adCampaign.platform } },
    });
    return json({ adCampaign, platformConnected: integration?.status === "connected" });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * PATCH /api/ad-campaigns/:id — edit budget/targeting/creative, or change status.
 * Moving status to "active" is gated on the campaign's platform being connected
 * (see settings/integrations or the connect cards on the Ads page) — this app
 * never actually calls out to Google/Meta yet, so "launch" here just means
 * "the campaign would go live once real ad-platform wiring exists," and that
 * gate exists so the UI can't imply a launch happened when it can't have.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await loadAdCampaign(session.orgId, id);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const { startDate, endDate, status, ...rest } = parsed.data;

    if (status === "active" && existing.status !== "active") {
      const integration = await prisma.integration.findUnique({
        where: { orgId_provider: { orgId: session.orgId, provider: existing.platform } },
      });
      if (integration?.status !== "connected") {
        throw new ApiError(
          `Connect ${existing.platform === "google_ads" ? "Google Ads" : "Instagram Ads"} before launching this campaign`,
          422,
        );
      }
    }

    const adCampaign = await prisma.adCampaign.update({
      where: { id },
      data: {
        ...rest,
        ...(status ? { status } : {}),
        ...(status === "active" && !existing.launchedAt ? { launchedAt: new Date() } : {}),
        ...(startDate !== undefined ? { startDate: startDate ? new Date(startDate) : null } : {}),
        ...(endDate !== undefined ? { endDate: endDate ? new Date(endDate) : null } : {}),
      },
    });
    return json({ adCampaign });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/ad-campaigns/:id — removes the campaign and its metric history. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    await loadAdCampaign(session.orgId, id);
    await prisma.adCampaign.delete({ where: { id } });
    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
