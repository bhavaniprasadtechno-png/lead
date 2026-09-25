/**
 * A lead created from a company-only CSV row has no name until the
 * enrichment agent discovers one (or fails to). Every list/detail view that
 * renders a lead's name needs the same fallback so it never shows a bare
 * blank or "undefined" while that discovery is pending.
 */
export function leadDisplayName(lead: { firstName?: string | null; lastName?: string | null; company?: string | null }): string {
  const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (lead.company) return lead.company;
  return "Unknown contact";
}
