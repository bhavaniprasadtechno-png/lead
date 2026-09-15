import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  industries: z.array(z.string()).optional(),
  companySizeMin: z.number().int().min(0).nullable().optional(),
  companySizeMax: z.number().int().min(0).nullable().optional(),
  jobTitles: z.array(z.string()).optional(),
  geographies: z.array(z.string()).optional(),
  technologies: z.array(z.string()).optional(),
  keywords: z.array(z.string()).optional(),
  exclusions: z.string().nullable().optional(),
  isActive: z.boolean().optional(),
});

/**
 * GET /api/icp-profiles/:id
 * Read by the app (session) or the n8n Prospector Agent (HMAC signature)
 * when it fetches the ICP criteria to search against.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const signature = req.headers.get("x-signature");
    let icpProfile;
    if (signature) {
      await requireN8nSignature(req, "", { skipDedupe: true });
      icpProfile = await prisma.icpProfile.findUnique({ where: { id } });
    } else {
      const session = await requireOrgSession();
      icpProfile = await prisma.icpProfile.findFirst({ where: { id, orgId: session.orgId } });
    }
    if (!icpProfile) throw new ApiError("ICP profile not found", 404);
    return json({ icpProfile });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.icpProfile.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("ICP profile not found", 404);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const icpProfile = await prisma.icpProfile.update({ where: { id }, data: parsed.data });
    return json({ icpProfile });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.icpProfile.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("ICP profile not found", 404);
    await prisma.icpProfile.delete({ where: { id } });
    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
