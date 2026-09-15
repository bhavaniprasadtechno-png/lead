import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { getOrgOverview } from "@/lib/analytics";
import { requireN8nSignature } from "@/lib/webhook-auth";

/**
 * GET /api/analytics/overview[?orgId=]
 * Read by the app dashboard (session) or the n8n Housekeeping Agent
 * (HMAC signature + orgId query param) for its nightly digest.
 */
export async function GET(req: Request) {
  try {
    const signature = req.headers.get("x-signature");
    let orgId: string;
    if (signature) {
      await requireN8nSignature(req, "", { skipDedupe: true });
      const { searchParams } = new URL(req.url);
      const qOrgId = searchParams.get("orgId");
      if (!qOrgId) throw new ApiError("orgId query param is required", 422);
      orgId = qOrgId;
    } else {
      const session = await requireOrgSession();
      orgId = session.orgId;
    }
    const overview = await getOrgOverview(orgId);
    return json(overview);
  } catch (err) {
    return handleApiError(err);
  }
}
