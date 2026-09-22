-- CreateTable
CREATE TABLE "ad_campaign_videos" (
    "id" TEXT NOT NULL,
    "ad_campaign_id" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ad_campaign_videos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ad_campaign_videos_ad_campaign_id_key" ON "ad_campaign_videos"("ad_campaign_id");

-- AddForeignKey
ALTER TABLE "ad_campaign_videos" ADD CONSTRAINT "ad_campaign_videos_ad_campaign_id_fkey" FOREIGN KEY ("ad_campaign_id") REFERENCES "ad_campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
