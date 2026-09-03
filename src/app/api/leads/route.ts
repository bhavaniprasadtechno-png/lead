import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";
import { triggerN8nWebhook } from "@/lib/n8n";

const createSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional(),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().url().optional().or(z.literal("")),
  website: z.string().optional(),
  source: z
    .enum(["web_form", "landing_page", "csv_import", "linkedin", "referral", "manual", "other"])
    .default("manual"),
});

export async function GET(req: Request) {
  try {
    const session = await requireOrgSession();
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q");

    const leads = await prisma.lead.findMany({
      where: {
        orgId: session.orgId,
        ...(status ? { status: status as any } : {}),
        ...(q
          ? {
              OR: [
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } },
                { email: { contains: q, mode: "insensitive" } },
                { company: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      include: { enrichment: true, owner: { select: { id: true, name: true } } },
      take: 200,
    });

    return json({ leads });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireOrgSession();
    const parsed = createSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }

    const lead = await prisma.lead.create({
      data: {
        orgId: session.orgId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        company: parsed.data.company,
        jobTitle: parsed.data.jobTitle,
        linkedinUrl: parsed.data.linkedinUrl || undefined,
        website: parsed.data.website,
        source: parsed.data.source,
        status: "new",
      },
    });

    await prisma.activity.create({
      data: {
        leadId: lead.id,
        type: "status_change",
        actor: "human",
        payload: { to: "new" },
      },
    });

    // Hand off to the n8n agent layer for enrichment -> scoring -> outreach.
    await triggerN8nWebhook("lead.created", { leadId: lead.id, orgId: session.orgId });

    return json({ lead }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
