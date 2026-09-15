import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { triggerN8nWebhook } from "@/lib/n8n";
import { requireN8nSignature } from "@/lib/webhook-auth";
import { QUALIFYING_SCORE_THRESHOLD } from "@/lib/constants";
import { autoEnrollQualifiedLead } from "@/lib/sequences";

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
      await requireN8nSignature(req, "", { skipDedupe: true });
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

/**
 * PATCH /api/leads/:id
 * Reachable two ways, same as GET above: an authenticated rep editing a
 * lead's own fields in the app, or an n8n agent workflow patching a score
 * (the Scoring Agent) or other fields via HMAC signature. Without this dual
 * path, agent-originated PATCHes (no session cookie) always 401 and a
 * lead's score is never written.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-signature");
    let orgId: string | undefined;
    if (signature) {
      await requireN8nSignature(req, rawBody);
    } else {
      const session = await requireOrgSession();
      orgId = session.orgId;
    }

    const { id } = await params;
    const existing = await prisma.lead.findFirst({ where: { id, ...(orgId ? { orgId } : {}) } });
    if (!existing) throw new ApiError("Lead not found", 404);
    orgId = orgId ?? existing.orgId;

    const parsed = patchSchema.safeParse(JSON.parse(rawBody || "{}"));
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
          actor: signature ? "agent" : "human",
          payload: { from: existing.status, to: data.status },
        },
      });

      if (data.status === "qualified") {
        await autoEnrollQualifiedLead(lead.id, orgId);
      }
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
        await triggerN8nWebhook("lead.qualified", { leadId: lead.id, orgId, score: data.score });
        await autoEnrollQualifiedLead(lead.id, orgId);
      }
    }

    const fresh = await loadLead(orgId, id);
    return json({ lead: fresh });
  } catch (err) {
    return handleApiError(err);
  }
}

/** DELETE /api/leads/:id — human-only (no n8n use case for deleting a lead). */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const existing = await prisma.lead.findFirst({ where: { id, orgId: session.orgId } });
    if (!existing) throw new ApiError("Lead not found", 404);
    await prisma.lead.delete({ where: { id } });
    return json({ ok: true });
  } catch (err) {
    return handleApiError(err);
  }
}
