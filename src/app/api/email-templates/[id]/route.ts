import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().min(1).optional(),
  bodyPrompt: z.string().min(1).optional(),
  tone: z.string().optional(),
  variables: z.record(z.string(), z.any()).optional(),
});

/**
 * GET /api/email-templates/:id
 * Read by the app (session) or the n8n Email Personalization Agent
 * (HMAC signature) when it needs the tone/goal brief for a sequence step.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const signature = req.headers.get("x-signature");
    let template;
    if (signature) {
      await requireN8nSignature(req, "", { skipDedupe: true });
      template = await prisma.emailTemplate.findUnique({ where: { id } });
    } else {
      const session = await requireOrgSession();
      template = await prisma.emailTemplate.findFirst({ where: { id, orgId: session.orgId } });
    }
    if (!template) throw new ApiError("Template not found", 404);
    return json({ template });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.emailTemplate.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("Template not found", 404);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const template = await prisma.emailTemplate.update({ where: { id }, data: parsed.data });
    return json({ template });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.emailTemplate.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("Template not found", 404);
    await prisma.emailTemplate.delete({ where: { id } });
    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
