import { prisma } from "@/lib/db";
import { triggerN8nWebhook } from "@/lib/n8n";
import type { LeadSource } from "@prisma/client";

/**
 * Creates a lead, logs the initial timeline entry, and hands it off to the
 * n8n agent layer for enrichment -> scoring -> outreach. Shared by the
 * manual "Add lead" flow and ICP-driven AI discovery — both funnel into the
 * exact same pipeline from this point on.
 */
export async function createLead(params: {
  orgId: string;
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  linkedinUrl?: string | null;
  website?: string | null;
  source: LeadSource;
  icpId?: string | null;
  discoveryRunId?: string | null;
}) {
  const lead = await prisma.lead.create({
    data: {
      orgId: params.orgId,
      firstName: params.firstName,
      lastName: params.lastName ?? undefined,
      email: params.email ?? undefined,
      phone: params.phone ?? undefined,
      company: params.company ?? undefined,
      jobTitle: params.jobTitle ?? undefined,
      linkedinUrl: params.linkedinUrl ?? undefined,
      website: params.website ?? undefined,
      source: params.source,
      icpId: params.icpId ?? undefined,
      discoveryRunId: params.discoveryRunId ?? undefined,
      status: "new",
    },
  });

  await prisma.activity.create({
    data: {
      leadId: lead.id,
      type: "status_change",
      actor: params.source === "ai_discovery" ? "agent" : "human",
      agentName: params.source === "ai_discovery" ? "prospector" : undefined,
      payload: { to: "new" },
    },
  });

  await triggerN8nWebhook("lead.created", { leadId: lead.id, orgId: params.orgId });

  return lead;
}
