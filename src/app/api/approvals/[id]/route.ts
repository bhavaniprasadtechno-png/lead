import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { triggerN8nWebhook } from "@/lib/n8n";

const schema = z.object({
  decision: z.enum(["approved", "rejected"]),
  editedOutput: z.record(z.string(), z.any()).optional(),
});

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const run = await prisma.agentRun.findFirst({
      where: { id, agent: { orgId: session.orgId } },
      include: { agent: true },
    });
    if (!run) throw new ApiError("Approval not found", 404);
    if (run.reviewedAt) throw new ApiError("Already reviewed", 409);

    const parsed = schema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }

    const updated = await prisma.agentRun.update({
      where: { id },
      data: {
        status: parsed.data.decision === "approved" ? "success" : "failure",
        output: parsed.data.editedOutput ?? run.output ?? undefined,
        reviewedAt: new Date(),
        reviewedBy: session.userId,
      },
    });

    if (run.leadId) {
      await prisma.activity.create({
        data: {
          leadId: run.leadId,
          type: "note",
          actor: "human",
          payload: { note: `Agent run ${parsed.data.decision} by reviewer`, agentRunId: run.id },
        },
      });
    }

    // Let the n8n workflow know it can proceed (send the approved reply,
    // schedule a meeting) or stand down. orgId is required by Agent 5's
    // Execute Workflow Trigger when the approval resumes a scheduling call.
    await triggerN8nWebhook("email.replied", {
      agentRunId: run.id,
      leadId: run.leadId,
      orgId: session.orgId,
      decision: parsed.data.decision,
      output: updated.output,
    });

    return json({ run: updated });
  } catch (err) {
    return handleApiError(err);
  }
}
