import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";
import { createLead } from "@/lib/leads";

const candidateSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().nullable().optional(),
  email: z.string().email().nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  sourceUrl: z.string().nullable().optional(),
  matchReason: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).nullable().optional(),
});

const schema = z.object({
  status: z.enum(["completed", "failed"]).default("completed"),
  errorMessage: z.string().optional(),
  candidates: z.array(candidateSchema).default([]),
});

/**
 * POST /api/icp-profiles/:id/runs/:runId/results
 * Called by the n8n Prospector Agent once the web search finishes. Every
 * candidate becomes a real Lead record (source = ai_discovery) and re-enters
 * the normal enrichment/scoring pipeline, whether or not a verifiable email
 * was found — we never fabricate contact info, so leads without one just
 * show "No email on file" and won't reach the auto-send step. Dedupes
 * against existing leads by email within the org when an email is present;
 * candidates without one can't be reliably deduped, so each is imported.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string; runId: string }> },
) {
  try {
    const rawBody = await req.text();
    await requireN8nSignature(req, rawBody);

    const { id, runId } = await params;
    const run = await prisma.leadDiscoveryRun.findFirst({ where: { id: runId, icpId: id } });
    if (!run) throw new ApiError("Discovery run not found", 404);

    const parsed = schema.safeParse(JSON.parse(rawBody || "{}"));
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, 422);
    }
    const data = parsed.data;

    if (data.status === "failed") {
      const failedRun = await prisma.leadDiscoveryRun.update({
        where: { id: runId },
        data: { status: "failed", errorMessage: data.errorMessage, completedAt: new Date() },
      });
      return json({ run: failedRun });
    }

    let created = 0;
    let skippedDuplicate = 0;

    for (const candidate of data.candidates) {
      if (candidate.email) {
        const existing = await prisma.lead.findFirst({
          where: { orgId: run.orgId, email: { equals: candidate.email, mode: "insensitive" } },
        });
        if (existing) {
          skippedDuplicate++;
          continue;
        }
      }

      await createLead({
        orgId: run.orgId,
        firstName: candidate.firstName,
        lastName: candidate.lastName,
        email: candidate.email,
        company: candidate.company,
        jobTitle: candidate.jobTitle,
        linkedinUrl: candidate.linkedinUrl,
        website: candidate.website,
        source: "ai_discovery",
        icpId: id,
        discoveryRunId: runId,
      });
      created++;
    }

    const completedRun = await prisma.leadDiscoveryRun.update({
      where: { id: runId },
      data: {
        status: "completed",
        candidates: data.candidates,
        leadsFound: data.candidates.length,
        leadsCreated: created,
        leadsSkipped: skippedDuplicate,
        completedAt: new Date(),
      },
    });

    return json({ run: completedRun });
  } catch (err) {
    return handleApiError(err);
  }
}
