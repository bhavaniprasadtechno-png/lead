import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";
import { triggerN8nWebhook } from "@/lib/n8n";

const schema = z.object({
  companySize: z.string().nullable().optional(),
  industry: z.string().nullable().optional(),
  revenueRange: z.string().nullable().optional(),
  technologiesUsed: z.array(z.string()).optional(),
  socialProfiles: z.record(z.string(), z.any()).optional(),
  rawPayload: z.record(z.string(), z.any()).optional(),
});

/**
 * PATCH /api/leads/:id/enrichment
 * Called by the n8n Lead Enrichment Agent (Agent 1) after it looks up the
 * lead in Apollo/Clearbit. Authenticated via HMAC signature, not a user
 * session — this endpoint is machine-to-machine.
 */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const rawBody = await req.text();
    const { duplicate } = await requireN8nSignature(req, rawBody);

    const { id } = await params;
    const lead = await prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new ApiError("Lead not found", 404);

    // Must not re-run: this handler also re-triggers the n8n lead.enriched
    // webhook below, which would fan out into a duplicate Agent 2 run.
    if (duplicate) {
      const enrichment = await prisma.leadEnrichment.findUnique({ where: { leadId: id } });
      return json({ enrichment, duplicate: true });
    }

    const parsed = schema.safeParse(JSON.parse(rawBody || "{}"));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const data = parsed.data;

    const enrichment = await prisma.leadEnrichment.upsert({
      where: { leadId: id },
      create: {
        leadId: id,
        companySize: data.companySize ?? undefined,
        industry: data.industry ?? undefined,
        revenueRange: data.revenueRange ?? undefined,
        technologiesUsed: data.technologiesUsed ?? undefined,
        socialProfiles: data.socialProfiles ?? undefined,
        rawPayload: data.rawPayload ?? undefined,
      },
      update: {
        companySize: data.companySize ?? undefined,
        industry: data.industry ?? undefined,
        revenueRange: data.revenueRange ?? undefined,
        technologiesUsed: data.technologiesUsed ?? undefined,
        socialProfiles: data.socialProfiles ?? undefined,
        rawPayload: data.rawPayload ?? undefined,
        enrichedAt: new Date(),
      },
    });

    await prisma.lead.update({ where: { id }, data: { status: "scoring" } });

    await prisma.activity.create({
      data: {
        leadId: id,
        type: "enrichment_completed",
        actor: "agent",
        agentName: "enricher",
        payload: { industry: data.industry ?? null, companySize: data.companySize ?? null },
      },
    });

    await triggerN8nWebhook("lead.enriched", { leadId: id, orgId: lead.orgId });

    return json({ enrichment });
  } catch (err) {
    return handleApiError(err);
  }
}
