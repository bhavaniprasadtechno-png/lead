import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleApiError, json, ApiError } from "@/lib/api";
import { requireN8nSignature } from "@/lib/webhook-auth";
import { createLead } from "@/lib/leads";

// Normalizes one raw candidate field before validation: the LLM is
// instructed to use null for "not found" but lite models occasionally emit
// "" instead. z.string().email() rejects "" (it's not a valid email), and
// since candidates are validated as one array, a single "" email used to
// fail the *entire* batch — leaving a run stuck at "queued" forever with
// none of its candidates ever becoming leads. Coercing blanks (and
// obviously-invalid emails) to null keeps a messy field from taking every
// other real candidate in the run down with it.
function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length ? trimmed : null;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function cleanEmail(v: unknown): string | null {
  const s = cleanStr(v);
  return s && EMAIL_RE.test(s) ? s : null;
}

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
    const { duplicate } = await requireN8nSignature(req, rawBody);

    const { id, runId } = await params;
    const run = await prisma.leadDiscoveryRun.findFirst({ where: { id: runId, icpId: id } });
    if (!run) throw new ApiError("Discovery run not found", 404);

    if (duplicate) return json({ run, duplicate: true });

    const rawParsed = JSON.parse(rawBody || "{}");
    if (Array.isArray(rawParsed.candidates)) {
      rawParsed.candidates = rawParsed.candidates
        .filter((c: unknown) => c && typeof c === "object" && !!cleanStr((c as Record<string, unknown>).firstName))
        .map((c: Record<string, unknown>) => ({
          ...c,
          firstName: cleanStr(c.firstName),
          lastName: cleanStr(c.lastName),
          email: cleanEmail(c.email),
          company: cleanStr(c.company),
          jobTitle: cleanStr(c.jobTitle),
          linkedinUrl: cleanStr(c.linkedinUrl),
          website: cleanStr(c.website),
          sourceUrl: cleanStr(c.sourceUrl),
          matchReason: cleanStr(c.matchReason),
        }));
    }

    const parsed = schema.safeParse(rawParsed);
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

    // Each candidate is created independently — one candidate's DB error
    // (a bad field, a race on the dedupe check) no longer aborts the loop
    // and strands every candidate after it. The run still ends up
    // "completed" with an accurate created/skipped count either way.
    for (const candidate of data.candidates) {
      try {
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
      } catch (err) {
        console.error(`[icp-discover] failed to create lead for candidate in run ${runId}`, err);
      }
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
