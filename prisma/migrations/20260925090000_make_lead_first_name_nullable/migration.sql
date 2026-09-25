-- AlterTable
-- Bulk-uploaded leads can now be created from company + website + job
-- title(s) alone (no name yet on file) -- the AI enrichment agent
-- discovers the contact's name (and email/phone/LinkedIn where possible)
-- after import, so firstName can no longer be required at creation time.
ALTER TABLE "leads" ALTER COLUMN "first_name" DROP NOT NULL;
