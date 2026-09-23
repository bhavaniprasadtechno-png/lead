import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireOrgSession, handleApiError, json, ApiError } from "@/lib/api";
import { createLead } from "@/lib/leads";
import { parseCsv } from "@/lib/csv";

const MAX_ROWS = 200;

/** Maps a normalized (lowercased, whitespace/underscore/dash-stripped) CSV header to its lead field. */
const HEADER_MAP: Record<string, string> = {
  firstname: "firstName",
  lastname: "lastName",
  email: "email",
  emailaddress: "email",
  phone: "phone",
  phonenumber: "phone",
  company: "company",
  companyname: "company",
  jobtitle: "jobTitle",
  title: "jobTitle",
  linkedinurl: "linkedinUrl",
  linkedin: "linkedinUrl",
  website: "website",
  domain: "website",
};

function normalizeRow(raw: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    const norm = key.trim().toLowerCase().replace(/[\s_-]+/g, "");
    const field = HEADER_MAP[norm];
    if (field && value) out[field] = value;
  }
  return out;
}

const rowSchema = z.object({
  firstName: z.string().min(1, "firstName is required"),
  lastName: z.string().optional(),
  email: z.string().email("invalid email").optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  jobTitle: z.string().optional(),
  linkedinUrl: z.string().url("invalid linkedinUrl").optional(),
  website: z.string().optional(),
});

/**
 * POST /api/leads/bulk-upload — parses an uploaded CSV, creates a lead per
 * row via the shared createLead() pipeline (same path as manual add and ICP
 * discovery), so every imported lead automatically flows through the
 * existing lead.created -> Apollo enrichment -> scoring agent chain with no
 * separate enrichment call needed here.
 */
export async function POST(req: Request) {
  try {
    const session = await requireOrgSession();

    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      throw new ApiError("No CSV file uploaded", 400);
    }

    const text = await file.text();
    const rawRows = parseCsv(text);
    if (rawRows.length === 0) {
      throw new ApiError("CSV file is empty", 400);
    }
    if (rawRows.length > MAX_ROWS) {
      throw new ApiError(`Too many rows — max ${MAX_ROWS} per upload`, 400);
    }

    const existingEmails = new Set(
      (
        await prisma.lead.findMany({
          where: { orgId: session.orgId, email: { not: null } },
          select: { email: true },
        })
      ).map((l) => (l.email ?? "").toLowerCase())
    );
    const seenInFile = new Set<string>();

    let created = 0;
    let skipped = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < rawRows.length; i++) {
      const normalized = normalizeRow(rawRows[i]);
      const parsed = rowSchema.safeParse(normalized);
      if (!parsed.success) {
        errors.push({ row: i + 2, error: parsed.error.issues[0]?.message ?? "Invalid row" });
        continue;
      }

      const email = parsed.data.email?.toLowerCase();
      if (email) {
        if (existingEmails.has(email) || seenInFile.has(email)) {
          skipped++;
          continue;
        }
        seenInFile.add(email);
      }

      await createLead({
        orgId: session.orgId,
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        email: parsed.data.email,
        phone: parsed.data.phone,
        company: parsed.data.company,
        jobTitle: parsed.data.jobTitle,
        linkedinUrl: parsed.data.linkedinUrl,
        website: parsed.data.website,
        source: "csv_import",
      });
      created++;
    }

    return json({ created, skipped, errors, totalRows: rawRows.length });
  } catch (err) {
    return handleApiError(err);
  }
}
