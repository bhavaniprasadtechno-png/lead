import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const icpProfile = await prisma.icpProfile.findFirst({ where: { id, orgId: session.orgId } });
    if (!icpProfile) throw new ApiError("ICP profile not found", 404);

    const runs = await prisma.leadDiscoveryRun.findMany({
      where: { icpId: id },
      orderBy: { startedAt: "desc" },
      take: 50,
    });
    return json({ runs });
  } catch (err) {
    return handleApiError(err);
  }
}
