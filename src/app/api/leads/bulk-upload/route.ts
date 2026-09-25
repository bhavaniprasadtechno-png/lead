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

/** Dedup key for a company-only row with no email to key on. Null when there's nothing to key by. */
function companyKey(company?: string | null, website?: string | null): string | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  if (website) return `w:${norm(website)}`;
  if (company) return `c:${norm(company)}`;
  return null;
}

const rowSchema = z
  .object({
    firstName: z.string().min(1).optional(),
    lastName: z.string().optional(),
    email: z.string().email("invalid email").optional(),
    phone: z.string().optional(),
    company: z.string().optional(),
    jobTitle: z.string().optional(),
    linkedinUrl: z.string().url("invalid linkedinUrl").optional(),
    website: z.string().optional(),
  })
  // A row needs SOMETHING to identify or search for a lead by -- a name,
  // an email, or at least a company/website the enrichment agent can go
  // discover a contact from. An all-blank row is just a stray empty line.
  .refine((row) => !!(row.firstName || row.email || row.company || row.website), {
    message: "row needs at least a name, email, company, or website",
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

    const existingLeads = await prisma.lead.findMany({
      where: { orgId: session.orgId },
      select: { email: true, company: true, website: true },
    });
    const existingEmails = new Set(existingLeads.map((l) => (l.email ?? "").toLowerCase()).filter(Boolean));
    // Company-only rows (no email yet) have nothing but company+website to
    // key on -- without this, re-uploading the same prospect list creates a
    // fresh duplicate lead every time instead of being recognized as one
    // already imported and awaiting (or done with) contact discovery.
    const existingCompanyKeys = new Set(
      existingLeads
        .map((l) => companyKey(l.company, l.website))
        .filter((k): k is string => k !== null)
    );
    const seenEmailsInFile = new Set<string>();
    const seenCompanyKeysInFile = new Set<string>();

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
        if (existingEmails.has(email) || seenEmailsInFile.has(email)) {
          skipped++;
          continue;
        }
        seenEmailsInFile.add(email);
      } else {
        const key = companyKey(parsed.data.company, parsed.data.website);
        if (key && (existingCompanyKeys.has(key) || seenCompanyKeysInFile.has(key))) {
          skipped++;
          continue;
        }
        if (key) seenCompanyKeysInFile.add(key);
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
