-- AlterEnum
ALTER TYPE "IntegrationProvider" ADD VALUE 'google_ads';
ALTER TYPE "IntegrationProvider" ADD VALUE 'instagram_ads';

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('google_ads', 'instagram_ads');

-- CreateEnum
CREATE TYPE "AdCampaignStatus" AS ENUM ('draft', 'active', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "AdObjective" AS ENUM ('awareness', 'traffic', 'leads', 'conversions');

-- CreateTable
CREATE TABLE "ad_campaigns" (
    "id" TEXT NOT NULL,
    "org_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "objective" "AdObjective" NOT NULL DEFAULT 'leads',
    "status" "AdCampaignStatus" NOT NULL DEFAULT 'draft',
    "daily_budget" DECIMAL(10,2),
    "total_budget" DECIMAL(10,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "start_date" TIMESTAMP(3),
    "end_date" TIMESTAMP(3),
    "targeting" JSONB,
    "headline" TEXT,
    "primary_text" TEXT,
    "destination_url" TEXT,
    "image_url" TEXT,
    "external_campaign_id" TEXT,
    "launched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ad_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ad_campaign_metrics" (
    "id" TEXT NOT NULL,
    "ad_campaign_id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "leads" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ad_campaign_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ad_campaigns_org_id_idx" ON "ad_campaigns"("org_id");

-- CreateIndex
CREATE UNIQUE INDEX "ad_campaign_metrics_ad_campaign_id_date_key" ON "ad_campaign_metrics"("ad_campaign_id", "date");

-- AddForeignKey
ALTER TABLE "ad_campaigns" ADD CONSTRAINT "ad_campaigns_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ad_campaign_metrics" ADD CONSTRAINT "ad_campaign_metrics_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
