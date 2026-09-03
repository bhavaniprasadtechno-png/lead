import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";

/**
 * GET /api/agents/by-type/:type?orgId=...
 * n8n workflows call this at the start of every run to fetch the current
 * system prompt / model / config for an agent type, so prompts can be
 * tuned from the app UI (agents.system_prompt) without redeploying any
 * n8n workflow. Machine-to-machine, HMAC-signed.
 */
export async function GET(req: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    await requireN8nSignature(req, "");

    const { type } = await params;
    const { searchParams } = new URL(req.url);
    const orgId = searchParams.get("orgId");
    if (!orgId) throw new ApiError("orgId query param is required", 422);

    const agent = await prisma.agent.findFirst({
      where: { orgId, type: type as any, isActive: true },
      orderBy: { createdAt: "asc" },
    });
    if (!agent) throw new ApiError(`No active agent of type "${type}" for this org`, 404);

    return json({
      agent: {
        id: agent.id,
        name: agent.name,
        type: agent.type,
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        config: agent.config,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
