-- CreateEnum
CREATE TYPE "DiscoveryRunStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- AlterEnum
ALTER TYPE "AgentType" ADD VALUE 'prospector';

-- AlterEnum
ALTER TYPE "LeadSource" ADD VALUE 'ai_discovery';

-- AlterTable
ALTER TABLE "leads" ADD COLUMN     "discovery_run_id" TEXT,
ADD COLUMN     "icp_id" TEXT;

-- CreateTable
CREATE TABLE "icp_profiles" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "industries" JSONB,
    "company_size_min" INTEGER,
    "company_size_max" INTEGER,
    "jobTitles" JSONB,
    "geographies" JSONB,
    "technologies" JSONB,
    "keywords" JSONB,
    "exclusions" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "icp_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_discovery_runs" (
    "id" TEXT NOT NULL,
    "icp_id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "status" "DiscoveryRunStatus" NOT NULL DEFAULT 'queued',
    "triggered_by" TEXT,
    "candidates" JSONB,
    "leads_found" INTEGER,
    "leads_created" INTEGER,
    "leads_skipped" INTEGER,
    "error_message" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "lead_discovery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "icp_profiles_org_id_idx" ON "icp_profiles"("org_id");

-- CreateIndex
CREATE INDEX "lead_discovery_runs_icp_id_idx" ON "lead_discovery_runs"("icp_id");

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_icp_id_fkey" FOREIGN KEY ("icp_id") REFERENCES "icp_profiles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_discovery_run_id_fkey" FOREIGN KEY ("discovery_run_id") REFERENCES "lead_discovery_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "icp_profiles" ADD CONSTRAINT "icp_profiles_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_discovery_runs" ADD CONSTRAINT "lead_discovery_runs_icp_id_fkey" FOREIGN KEY ("icp_id") REFERENCES "icp_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_discovery_runs" ADD CONSTRAINT "lead_discovery_runs_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
