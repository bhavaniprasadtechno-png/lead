import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { callGoogleAI, parseStrictJson } from "@/lib/llm";

const CHAR_LIMITS: Record<string, { headline: number; primaryText: number }> = {
  google_ads: { headline: 30, primaryText: 90 },
  instagram_ads: { headline: 40, primaryText: 125 },
};

interface AiPreviewResult {
  headline: string;
  primaryText: string;
  cta: string;
}

/**
 * POST /api/ad-campaigns/:id/ai-preview — asks Gemini to turn the campaign's
 * current draft copy into realistic, platform-appropriate ad copy for the
 * Preview card. A pure suggestion: nothing here is saved to the campaign
 * until the user applies it and clicks Save, same human-in-the-loop pattern
 * as every other AI-drafted content in this app.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const campaign = await prisma.adCampaign.findFirst({
      where: { id, orgId: session.orgId },
      include: { video: { select: { mimeType: true } } },
    });
    if (!campaign) throw new ApiError("Ad campaign not found", 404);

    const limits = CHAR_LIMITS[campaign.platform] ?? CHAR_LIMITS.google_ads;
    const platformLabel = campaign.platform === "google_ads" ? "Google Ads" : "Instagram feed ads";

    const systemPrompt = `You are an expert ${platformLabel} copywriter. You will receive a draft ad's
current headline, primary text, destination URL, objective, and targeting
as JSON.

Rules:
- Write realistic, polished ad copy appropriate for ${platformLabel} — the
  actual copy that would run, not a description of the ad.
- Never invent a feature, claim, offer, or statistic that isn't implied by
  the input. If the input is sparse, write something plausible and generic
  rather than fabricating specifics.
- Respect real platform limits: headline <= ${limits.headline} characters,
  primary text <= ${limits.primaryText} characters.
- cta must be a short, real ad call-to-action label (e.g. "Learn More",
  "Sign Up", "Shop Now", "Get a Demo") appropriate to the objective.
- Output STRICT JSON only, no prose, no markdown fences:
{ "headline": "<string>", "primaryText": "<string>", "cta": "<string>" }`;

    const userContent = JSON.stringify({
      platform: campaign.platform,
      objective: campaign.objective,
      currentHeadline: campaign.headline,
      currentPrimaryText: campaign.primaryText,
      destinationUrl: campaign.destinationUrl,
      targeting: campaign.targeting,
      hasVideo: !!campaign.video,
      hasImage: !!campaign.imageUrl,
    });

    const raw = await callGoogleAI({ systemPrompt, userContent, maxTokens: 400 });
    const preview = parseStrictJson<AiPreviewResult>(raw);
    return json({ preview });
  } catch (err) {
    if (err instanceof Error && err.message.includes("GOOGLE_AI_API_KEY")) {
      return json(
        {
          error:
            "AI preview isn't configured yet — set GOOGLE_AI_API_KEY in the app's environment (Render dashboard), the same key already used for n8n's Variables.",
        },
        503,
      );
    }
    return handleApiError(err);
  }
}
