import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";

const MAX_VIDEO_BYTES = 5 * 1024 * 1024; // 5MB

async function loadOwnedCampaign(orgId: string, id: string) {
  const campaign = await prisma.adCampaign.findFirst({ where: { id, orgId } });
  if (!campaign) throw new ApiError("Ad campaign not found", 404);
  return campaign;
}

/** GET /api/ad-campaigns/:id/video — streams the uploaded creative video, if any. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    await loadOwnedCampaign(session.orgId, id);
    const video = await prisma.adCampaignVideo.findUnique({ where: { adCampaignId: id } });
    if (!video) throw new ApiError("No video uploaded for this campaign", 404);
    return new Response(new Uint8Array(video.data), {
      headers: {
        "content-type": video.mimeType,
        "content-length": String(video.sizeBytes),
        "cache-control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/ad-campaigns/:id/video — upload/replace the campaign's creative
 * video. Multipart form with a "video" file field, capped at 5MB — the app's
 * whole point is a fast, honest preview of the creative, not video hosting,
 * so this deliberately doesn't try to support anything larger.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    await loadOwnedCampaign(session.orgId, id);

    const form = await req.formData().catch(() => null);
    const file = form?.get("video");
    if (!(file instanceof File)) {
      return json({ error: "No video file provided" }, 422);
    }
    if (!file.type.startsWith("video/")) {
      return json({ error: "File must be a video" }, 422);
    }
    if (file.size > MAX_VIDEO_BYTES) {
      return json({ error: "Video must be 5MB or smaller" }, 422);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const video = await prisma.adCampaignVideo.upsert({
      where: { adCampaignId: id },
      create: { adCampaignId: id, data: buffer, mimeType: file.type, sizeBytes: buffer.byteLength },
      update: { data: buffer, mimeType: file.type, sizeBytes: buffer.byteLength },
    });
    return json({ video: { mimeType: video.mimeType, sizeBytes: video.sizeBytes } }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/ad-campaigns/:id/video — removes the uploaded video, if any. */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    await loadOwnedCampaign(session.orgId, id);
    await prisma.adCampaignVideo.deleteMany({ where: { adCampaignId: id } });
    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
