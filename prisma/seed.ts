import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_AGENT_PROMPTS, DEFAULT_AGENT_MODEL } from "../src/lib/constants";

const prisma = new PrismaClient();

async function main() {
  const orgName = "Demo Org";
  const email = "demo@leadpilot.ai";
  const password = "demo12345";

  let org = await prisma.organization.findFirst({ where: { name: orgName } });
  if (!org) {
    org = await prisma.organization.create({ data: { name: orgName, plan: "trial" } });
  }

  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({
      data: {
        orgId: org.id,
        email,
        name: "Demo Rep",
        role: "owner",
        passwordHash: await bcrypt.hash(password, 10),
      },
    });
  }

  // Agents — one per type, seeded with the system prompts from the platform spec.
  const agentIds: Record<string, string> = {};
  for (const key of Object.keys(DEFAULT_AGENT_PROMPTS)) {
    const def = DEFAULT_AGENT_PROMPTS[key];
    const existing = await prisma.agent.findFirst({ where: { orgId: org.id, type: def.type as any } });
    const agent =
      existing ??
      (await prisma.agent.create({
        data: {
          orgId: org.id,
          name: def.name,
          type: def.type as any,
          systemPrompt: def.prompt,
          model: DEFAULT_AGENT_MODEL,
          isActive: true,
        },
      }));
    agentIds[key] = agent.id;
  }

  // Email template
  let template = await prisma.emailTemplate.findFirst({ where: { orgId: org.id, name: "First touch — SaaS ops" } });
  if (!template) {
    template = await prisma.emailTemplate.create({
      data: {
        orgId: org.id,
        name: "First touch — SaaS ops",
        subject: "Quick question about {{company}}'s lead process",
        bodyPrompt:
          "Introduce LeadPilot as an AI lead qualification + nurture platform. Reference one concrete enrichment detail. Ask if they're currently manually triaging inbound leads. One clear question, no pitch.",
        tone: "consultative",
      },
    });
  }

  let followUpTemplate = await prisma.emailTemplate.findFirst({ where: { orgId: org.id, name: "Follow-up — social proof" } });
  if (!followUpTemplate) {
    followUpTemplate = await prisma.emailTemplate.create({
      data: {
        orgId: org.id,
        name: "Follow-up — social proof",
        subject: "Following up — {{company}}",
        bodyPrompt: "Brief follow-up referencing that we help similar companies cut lead response time. Ask for 15 minutes.",
        tone: "casual",
      },
    });
  }

  // Campaign + sequence
  let campaign = await prisma.campaign.findFirst({ where: { orgId: org.id, name: "Q1 Outbound — SaaS Ops Leaders" } });
  if (!campaign) {
    campaign = await prisma.campaign.create({
      data: {
        orgId: org.id,
        name: "Q1 Outbound — SaaS Ops Leaders",
        goal: "Book demos with mid-market RevOps / Sales Ops leaders",
        status: "active",
      },
    });
    await prisma.sequence.create({
      data: {
        campaignId: campaign.id,
        name: "Qualified lead nurture",
        triggerType: "lead_qualified",
        steps: [
          { order: 0, delayHours: 0, templateId: template.id },
          { order: 1, delayHours: 72, templateId: followUpTemplate.id },
        ],
      },
    });
  }

  // Sample leads across the funnel
  const sampleLeads = [
    {
      firstName: "Avery",
      lastName: "Chen",
      email: "avery.chen@northwind-labs.com",
      company: "Northwind Labs",
      jobTitle: "VP Revenue Operations",
      source: "web_form" as const,
      status: "qualified" as const,
      score: 82,
      scoreReason: "Senior title, mid-market SaaS, strong intent signal from demo request form.",
      enrichment: {
        companySize: "201-500",
        industry: "B2B SaaS",
        revenueRange: "$20M-$50M",
        technologiesUsed: ["Salesforce", "HubSpot", "Segment"],
      },
    },
    {
      firstName: "Priya",
      lastName: "Natarajan",
      email: "priya@fieldscale.io",
      company: "FieldScale",
      jobTitle: "Head of Sales Development",
      source: "linkedin" as const,
      status: "engaged" as const,
      score: 74,
      scoreReason: "Strong ICP fit; replied showing interest in a demo.",
      enrichment: {
        companySize: "51-200",
        industry: "Vertical SaaS",
        revenueRange: "$5M-$20M",
        technologiesUsed: ["Outreach", "Salesforce"],
      },
    },
    {
      firstName: "Marcus",
      lastName: "Bell",
      email: "marcus.bell@granitepeak.co",
      company: "Granite Peak Partners",
      jobTitle: "Director of Growth",
      source: "landing_page" as const,
      status: "meeting_booked" as const,
      score: 88,
      scoreReason: "High buying intent, booked demo directly from pricing page.",
      enrichment: {
        companySize: "51-200",
        industry: "Financial Services",
        revenueRange: "$10M-$50M",
        technologiesUsed: ["HubSpot"],
      },
    },
    {
      firstName: "Dana",
      lastName: "Osei",
      email: "dana.osei@brightloop.ai",
      company: "BrightLoop AI",
      jobTitle: "Marketing Coordinator",
      source: "csv_import" as const,
      status: "disqualified" as const,
      score: 28,
      scoreReason: "Junior title with no budget authority; company size too small for ICP.",
      enrichment: null,
    },
    {
      firstName: "Sam",
      lastName: "Rivera",
      email: "sam.rivera@dockyard-systems.com",
      company: "Dockyard Systems",
      jobTitle: "Sales Ops Manager",
      source: "referral" as const,
      status: "new" as const,
      score: null,
      scoreReason: null,
      enrichment: null,
    },
    {
      firstName: "Lena",
      lastName: "Farr",
      email: "lena.farr@tallgrass-crm.com",
      company: "Tallgrass CRM",
      jobTitle: "Chief Revenue Officer",
      source: "web_form" as const,
      status: "won" as const,
      score: 91,
      scoreReason: "Executive buyer, urgent need, converted after two calls.",
      enrichment: {
        companySize: "501-1000",
        industry: "B2B SaaS",
        revenueRange: "$50M-$100M",
        technologiesUsed: ["Salesforce", "Gong", "Outreach"],
      },
    },
  ];

  for (const l of sampleLeads) {
    const existing = await prisma.lead.findFirst({ where: { orgId: org.id, email: l.email } });
    if (existing) continue;

    const lead = await prisma.lead.create({
      data: {
        orgId: org.id,
        firstName: l.firstName,
        lastName: l.lastName,
        email: l.email,
        company: l.company,
        jobTitle: l.jobTitle,
        source: l.source,
        status: l.status,
        score: l.score,
        scoreReason: l.scoreReason,
        ownerId: user.id,
      },
    });

    if (l.enrichment) {
      await prisma.leadEnrichment.create({
        data: {
          leadId: lead.id,
          companySize: l.enrichment.companySize,
          industry: l.enrichment.industry,
          revenueRange: l.enrichment.revenueRange,
          technologiesUsed: l.enrichment.technologiesUsed,
        },
      });
      await prisma.activity.create({
        data: { leadId: lead.id, type: "enrichment_completed", actor: "agent", agentName: "enricher", payload: { industry: l.enrichment.industry } },
      });
    }

    await prisma.activity.create({
      data: { leadId: lead.id, type: "status_change", actor: "human", payload: { to: "new" } },
    });

    if (l.score !== null) {
      await prisma.activity.create({
        data: {
          leadId: lead.id,
          type: "score_updated",
          actor: "agent",
          agentName: "scorer",
          payload: { score: l.score, reason: l.scoreReason },
        },
      });
      await prisma.agentRun.create({
        data: {
          agentId: agentIds.scorer,
          leadId: lead.id,
          input: { company: l.company, jobTitle: l.jobTitle, source: l.source },
          output: { score: l.score, qualified: l.score >= 60, reason: l.scoreReason },
          status: "success",
          latencyMs: 1200 + Math.round(Math.random() * 800),
        },
      });
    }

    if (["contacted", "engaged", "meeting_booked", "won"].includes(l.status)) {
      const emailLog = await prisma.emailLog.create({
        data: {
          leadId: lead.id,
          subject: `Quick question about ${l.company}'s lead process`,
          body: `Hi ${l.firstName},\n\nNoticed ${l.company} is scaling fast — are you still triaging inbound leads manually?\n\nWorth a quick chat?`,
          threadId: `thread-${lead.id}`,
        },
      });
      await prisma.activity.create({
        data: { leadId: lead.id, type: "email_sent", actor: "agent", agentName: "writer", payload: { subject: emailLog.subject } },
      });
    }

    if (["engaged", "meeting_booked", "won"].includes(l.status)) {
      await prisma.activity.create({
        data: {
          leadId: lead.id,
          type: "email_replied",
          actor: "agent",
          agentName: "classifier",
          payload: { intent: "interested", confidence: 0.91 },
        },
      });
    }

    if (["meeting_booked", "won"].includes(l.status)) {
      await prisma.activity.create({
        data: { leadId: lead.id, type: "meeting_booked", actor: "agent", agentName: "scheduler", payload: {} },
      });
    }
  }

  // A pending human-review item so the Approvals queue has something to show.
  const objectionLead = await prisma.lead.findFirst({ where: { orgId: org.id, email: "priya@fieldscale.io" } });
  if (objectionLead) {
    const alreadyPending = await prisma.agentRun.findFirst({
      where: { agentId: agentIds.classifier, leadId: objectionLead.id, status: "needs_review" },
    });
    if (!alreadyPending) {
      await prisma.agentRun.create({
        data: {
          agentId: agentIds.classifier,
          leadId: objectionLead.id,
          input: { threadExcerpt: "This looks interesting but what's the pricing for 50 seats?" },
          output: {
            intent: "objection",
            confidence: 0.68,
            suggested_reply: "Happy to walk through pricing for 50 seats — could we grab 15 minutes this week?",
            requires_human_review: true,
          },
          status: "needs_review",
        },
      });
    }
  }

  // Sample ICP + a completed discovery run, so the ICP Search page has
  // something to show immediately.
  let icp = await prisma.icpProfile.findFirst({ where: { orgId: org.id, name: "Mid-market RevOps leaders" } });
  if (!icp) {
    icp = await prisma.icpProfile.create({
      data: {
        orgId: org.id,
        name: "Mid-market RevOps leaders",
        description: "SaaS companies scaling their inbound funnel who'd benefit from AI lead qualification",
        industries: ["B2B SaaS"],
        companySizeMin: 51,
        companySizeMax: 500,
        jobTitles: ["VP Revenue Operations", "Head of Sales Development", "Director of Growth"],
        geographies: ["United States", "Canada"],
        technologies: ["Salesforce", "HubSpot"],
        keywords: ["hiring SDRs", "recently funded"],
      },
    });
  }

  const existingRun = await prisma.leadDiscoveryRun.findFirst({ where: { icpId: icp.id } });
  if (!existingRun) {
    const dockyardLead = await prisma.lead.findFirst({ where: { orgId: org.id, email: "sam.rivera@dockyard-systems.com" } });
    const candidates = [
      {
        firstName: "Sam",
        lastName: "Rivera",
        email: "sam.rivera@dockyard-systems.com",
        company: "Dockyard Systems",
        jobTitle: "Sales Ops Manager",
        linkedinUrl: null,
        website: "https://dockyard-systems.com",
        sourceUrl: "https://dockyard-systems.com/team",
        matchReason: "Sales Ops leader at a mid-market SaaS company matching target company size.",
        confidence: 0.82,
      },
      {
        firstName: "Jordan",
        lastName: "Blake",
        email: null,
        company: "Northfield Analytics",
        jobTitle: "VP Revenue Operations",
        linkedinUrl: "https://linkedin.com/in/example-jordan-blake",
        website: "https://northfield-analytics.example.com",
        sourceUrl: "https://northfield-analytics.example.com/about",
        matchReason: "Title and company profile match the ICP, but no public email was found.",
        confidence: 0.64,
      },
    ];

    const run = await prisma.leadDiscoveryRun.create({
      data: {
        icpId: icp.id,
        orgId: org.id,
        status: "completed",
        triggeredBy: user.id,
        candidates,
        leadsFound: candidates.length,
        leadsCreated: dockyardLead ? 1 : 0,
        leadsSkipped: 0,
        completedAt: new Date(),
      },
    });

    // Link the already-seeded matching lead back to this ICP/run for the
    // "View leads from this ICP" filter to have something to show.
    if (dockyardLead) {
      await prisma.lead.update({
        where: { id: dockyardLead.id },
        data: { icpId: icp.id, discoveryRunId: run.id, source: "ai_discovery" },
      });
    }
  }

  console.log("Seed complete.");
  console.log(`Login: ${email} / ${password}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
