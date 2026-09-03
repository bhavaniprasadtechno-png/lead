import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { triggerN8nWebhook } from "@/lib/n8n";
import { requireN8nSignature } from "@/lib/webhook-auth";
import { QUALIFYING_SCORE_THRESHOLD } from "@/lib/constants";

const patchSchema = z.object({
  status: z
    .enum([
      "new",
      "enriching",
      "scoring",
      "qualified",
      "disqualified",
      "contacted",
      "engaged",
      "meeting_booked",
      "won",
      "lost",
    ])
    .optional(),
  score: z.number().int().min(0).max(100).optional(),
  scoreReason: z.string().optional(),
  ownerId: z.string().uuid().nullable().optional(),
  firstName: z.string().min(1).optional(),
  lastName: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
});

async function loadLead(orgId: string | undefined, id: string) {
  const lead = await prisma.lead.findFirst({
    where: { id, ...(orgId ? { orgId } : {}) },
    include: {
      enrichment: true,
      owner: { select: { id: true, name: true } },
      activities: { orderBy: { createdAt: "desc" }, take: 100 },
      emailLogs: { orderBy: { sentAt: "desc" }, take: 50 },
      agentRuns: { orderBy: { createdAt: "desc" }, take: 20, include: { agent: true } },
    },
  });
  if (!lead) throw new ApiError("Lead not found", 404);
  return lead;
}

/**
 * GET /api/leads/:id
 * Reachable two ways: an authenticated rep viewing the lead in the app, or
 * an n8n agent workflow fetching context before a Claude call (e.g. the
 * Scoring Agent pulling lead + enrichment before it calls Claude). The
 * latter authenticates via HMAC signature instead of a session cookie.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const signature = req.headers.get("x-signature");
    let orgId: string | undefined;
    if (signature) {
      await requireN8nSignature(req, "");
    } else {
      const session = await requireOrgSession();
      orgId = session.orgId;
    }
    const { id } = await params;
    const lead = await loadLead(orgId, id);
    return json({ lead });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.lead.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("Lead not found", 404);

    const parsed = patchSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const data = parsed.data;

    const lead = await prisma.lead.update({
      where: { id },
      data: {
        ...(data.status ? { status: data.status } : {}),
        ...(data.score !== undefined ? { score: data.score } : {}),
        ...(data.scoreReason !== undefined ? { scoreReason: data.scoreReason } : {}),
        ...(data.ownerId !== undefined ? { ownerId: data.ownerId } : {}),
        ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
        ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.company !== undefined ? { company: data.company } : {}),
        ...(data.jobTitle !== undefined ? { jobTitle: data.jobTitle } : {}),
      },
    });

    if (data.status && data.status !== existing.status) {
      await prisma.activity.create({
        data: {
          leadId: lead.id,
          type: "status_change",
          actor: "human",
          payload: { from: existing.status, to: data.status },
        },
      });
    }

    if (data.score !== undefined && data.score !== existing.score) {
      await prisma.activity.create({
        data: {
          leadId: lead.id,
          type: "score_updated",
          actor: "agent",
          agentName: "scorer",
          payload: { score: data.score, reason: data.scoreReason ?? null },
        },
      });

      if (data.score >= QUALIFYING_SCORE_THRESHOLD && lead.status !== "qualified") {
        await prisma.lead.update({ where: { id }, data: { status: "qualified" } });
        await triggerN8nWebhook("lead.qualified", { leadId: lead.id, orgId: session.orgId, score: data.score });
      }
    }

    const fresh = await loadLead(session.orgId, id);
    return json({ lead: fresh });
  } catch (err) {
    return handleApiError(err);
  }
}
