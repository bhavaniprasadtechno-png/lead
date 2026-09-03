import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError, requireOrgSession } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";

const schema = z.object({
  type: z.enum([
    "email_sent",
    "email_opened",
    "email_clicked",
    "email_replied",
    "call_logged",
    "note",
    "status_change",
    "meeting_booked",
    "enrichment_completed",
    "score_updated",
  ]),
  actor: z.enum(["agent", "human", "system"]).default("agent"),
  agentName: z.string().optional(),
  payload: z.record(z.string(), z.any()).optional(),
});

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const lead = await prisma.lead.findFirst({ where: { id, orgId: session.orgId } });
    if (!lead) throw new ApiError("Lead not found", 404);

    const activities = await prisma.activity.findMany({
      where: { leadId: id },
      orderBy: { createdAt: "desc" },
    });
    return json({ activities });
  } catch (err) {
    return handleApiError(err);
  }
}

/**
 * POST /api/leads/:id/activities
 * Used both by the authenticated web app (human notes/calls) and by signed
 * n8n agent callbacks (email_sent, email_replied, etc). We accept either a
 * user session OR a valid HMAC signature.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new ApiError("Lead not found", 404);

    const rawBody = await req.text();
    const hasSignature = req.headers.get("x-signature");
    if (hasSignature) {
      await requireN8nSignature(req, rawBody);
    } else {
      await requireOrgSession();
    }

    const parsed = schema.safeParse(JSON.parse(rawBody || "{}"));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }

    const activity = await prisma.activity.create({
      data: {
        leadId: id,
        type: parsed.data.type,
        actor: parsed.data.actor,
        agentName: parsed.data.agentName,
        payload: parsed.data.payload,
      },
    });

    return json({ activity }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
