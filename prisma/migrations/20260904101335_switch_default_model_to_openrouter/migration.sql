-- AlterEnum
BEGIN;
CREATE TYPE "IntegrationProvider_new" AS ENUM ('n8n', 'apollo', 'clearbit', 'hunter', 'postmark', 'sendgrid', 'ses', 'gmail', 'microsoft_graph', 'cal_com', 'google_calendar', 'openrouter');
ALTER TABLE "integrations" ALTER COLUMN "provider" TYPE "IntegrationProvider_new" USING ("provider"::text::"IntegrationProvider_new");
ALTER TYPE "IntegrationProvider" RENAME TO "IntegrationProvider_old";
ALTER TYPE "IntegrationProvider_new" RENAME TO "IntegrationProvider";
DROP TYPE "IntegrationProvider_old";
COMMIT;

-- AlterTable
ALTER TABLE "agents" ALTER COLUMN "model" SET DEFAULT 'nvidia/nemotron-3-ultra-550b-a55b:free';

