import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";

const schema = z.object({
  event: z.enum(["reply.classified", "meeting.booked", "email.bounced", "sequence.step_sent"]),
  orgId: z.string().uuid(),
  leadId: z.string().uuid(),
  enrollmentId: z.string().uuid().optional(),
  agentType: z.enum(["enricher", "scorer", "writer", "classifier", "scheduler", "orchestrator", "housekeeping", "prospector"]).optional(),
  input: z.record(z.string(), z.any()).optional(),
  output: z.record(z.string(), z.any()).optional(),
  requiresHumanReview: z.boolean().default(false),
  nextStepDueAt: z.string().datetime().nullable().optional(),
});

/**
 * POST /api/webhooks/inbound
 * Generic, signed callback endpoint for n8n agent events that don't map to
 * a single lead field (reply classification, meeting booked, bounces,
 * sequence progression). Every request is logged to
 * webhooks_inbound_log (via requireN8nSignature) before being applied, so
 * we always have an audit trail and idempotent retries.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const { duplicate } = await requireN8nSignature(req, rawBody);
    if (duplicate) return json({ ok: true, duplicate: true });

    const parsed = schema.safeParse(JSON.parse(rawBody || "{}"));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const data = parsed.data;

    const lead = await prisma.lead.findFirst({ where: { id: data.leadId, orgId: data.orgId } });
    if (!lead) throw new ApiError("Lead not found for this org", 404);

    let agentRunId: string | undefined;
    if (data.agentType) {
      const agent = await prisma.agent.findFirst({ where: { orgId: data.orgId, type: data.agentType, isActive: true } });
      if (agent) {
        const run = await prisma.agentRun.create({
          data: {
            agentId: agent.id,
            leadId: lead.id,
            input: data.input ?? {},
            output: data.output ?? undefined,
            status: data.requiresHumanReview ? "needs_review" : "success",
          },
        });
        agentRunId = run.id;
      }
    }

    switch (data.event) {
      case "reply.classified": {
        await prisma.activity.create({
          data: {
            leadId: lead.id,
            type: "email_replied",
            actor: "agent",
            agentName: "classifier",
            payload: { ...data.output, agentRunId },
          },
        });
        const intent = (data.output?.intent as string) ?? undefined;
        if (intent === "not_interested" || intent === "unsubscribe") {
          await prisma.lead.update({ where: { id: lead.id }, data: { status: "lost" } });
        } else if (intent === "interested" && lead.status !== "meeting_booked") {
          await prisma.lead.update({ where: { id: lead.id }, data: { status: "engaged" } });
        }
        const mostRecentEmail = await prisma.emailLog.findFirst({
          where: { leadId: lead.id, repliedAt: null },
          orderBy: { sentAt: "desc" },
        });
        if (mostRecentEmail) {
          await prisma.emailLog.update({ where: { id: mostRecentEmail.id }, data: { repliedAt: new Date() } });
        }
        break;
      }
      case "meeting.booked": {
        await prisma.lead.update({ where: { id: lead.id }, data: { status: "meeting_booked" } });
        await prisma.activity.create({
          data: { leadId: lead.id, type: "meeting_booked", actor: "agent", agentName: "scheduler", payload: data.output ?? {} },
        });
        const bookingOutput = data.output as { subject?: string; body?: string; messageId?: string; threadId?: string } | undefined;
        if (bookingOutput?.subject) {
          await prisma.emailLog.create({
            data: {
              leadId: lead.id,
              subject: bookingOutput.subject,
              body: bookingOutput.body ?? "",
              messageId: bookingOutput.messageId,
              threadId: bookingOutput.threadId ?? bookingOutput.messageId,
            },
          });
        }
        break;
      }
      case "email.bounced": {
        await prisma.activity.create({
          data: { leadId: lead.id, type: "note", actor: "system", payload: { note: "Email bounced", ...data.output } },
        });
        break;
      }
      case "sequence.step_sent": {
        await prisma.activity.create({
          data: { leadId: lead.id, type: "email_sent", actor: "agent", agentName: "writer", payload: data.output ?? {} },
        });
        const sentOutput = data.output as { subject?: string; body?: string; messageId?: string; threadId?: string } | undefined;
        if (sentOutput?.subject) {
          await prisma.emailLog.create({
            data: {
              leadId: lead.id,
              subject: sentOutput.subject,
              body: sentOutput.body ?? "",
              messageId: sentOutput.messageId,
              threadId: sentOutput.threadId ?? sentOutput.messageId,
            },
          });
        }
        if (data.enrollmentId) {
          await prisma.sequenceEnrollment.update({
            where: { id: data.enrollmentId },
            data: {
              currentStep: { increment: 1 },
              nextStepDueAt: data.nextStepDueAt ? new Date(data.nextStepDueAt) : null,
            },
          });
        }
        break;
      }
    }

    return json({ ok: true, agentRunId });
  } catch (err) {
    return handleApiError(err);
  }
}
