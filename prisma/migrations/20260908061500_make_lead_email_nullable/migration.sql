-- AlterTable
-- Web-searched ICP candidates with no verifiable email are now imported as
-- leads for visibility (previously only candidates with a Hunter-verified
-- email became Lead rows), so email can no longer be required.
ALTER TABLE "leads" ALTER COLUMN "email" DROP NOT NULL;
