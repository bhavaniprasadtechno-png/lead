import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json } from "@/lib/api";

const upsertSchema = z.object({
  provider: z.enum([
    "n8n",
    "apollo",
    "clearbit",
    "hunter",
    "postmark",
    "sendgrid",
    "ses",
    "gmail",
    "microsoft_graph",
    "cal_com",
    "google_calendar",
    "openrouter",
  ]),
  credentialRef: z.string().optional(),
  status: z.enum(["connected", "disconnected", "error"]).default("connected"),
});

export async function GET() {
  try {
    const session = await requireOrgSession();
    const integrations = await prisma.integration.findMany({ where: { orgId: session.orgId } });
    return json({ integrations });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireOrgSession();
    const parsed = upsertSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const integration = await prisma.integration.upsert({
      where: { orgId_provider: { orgId: session.orgId, provider: parsed.data.provider } },
      create: { orgId: session.orgId, ...parsed.data, connectedAt: new Date() },
      update: { ...parsed.data, connectedAt: new Date() },
    });
    return json({ integration }, 201);
  } catch (err) {
    return handleApiError(err);
  }
}
