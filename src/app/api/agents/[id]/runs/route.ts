import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError, requireOrgSession } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";

const schema = z.object({
  leadId: z.string().uuid().optional(),
  input: z.record(z.string(), z.any()),
  output: z.record(z.string(), z.any()).optional(),
  status: z.enum(["success", "failure", "needs_review"]).default("success"),
  latencyMs: z.number().int().optional(),
});

/**
 * POST /api/agents/:id/runs
 * Called by n8n at the end of every agent execution to log input/output,
 * latency, and whether a human must review the result (e.g. an
 * AI-drafted reply touching pricing, per the classifier's
 * requires_human_review flag).
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const agent = await prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new ApiError("Agent not found", 404);

    const rawBody = await req.text();
    const { duplicate } = await requireN8nSignature(req, rawBody);
    if (duplicate) return json({ ok: true, duplicate: true });

    const parsed = schema.safeParse(JSON.parse(rawBody || "{}"));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }

    const run = await prisma.agentRun.create({
      data: {
        agentId: id,
        leadId: parsed.data.leadId,
        input: parsed.data.input,
        output: parsed.data.output,
        status: parsed.data.status,
        latencyMs: parsed.data.latencyMs,
      },
    });

    return json({ run }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await requireOrgSession();
    const { id } = await params;
    const agent = await prisma.agent.findFirst({ where: { id, orgId: session.orgId } });
    if (!agent) throw new ApiError("Agent not found", 404);

    const runs = await prisma.agentRun.findMany({
      where: { agentId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return json({ runs });
  } catch (err) {
    return handleApiError(err);
  }
}
