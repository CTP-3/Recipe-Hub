-- Tracks when a job last changed state (or sent a heartbeat) so interrupted
-- jobs can be recovered. Existing rows keep their data and hashes.
ALTER TABLE "VideoSource"
  ADD COLUMN "statusUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

UPDATE "VideoSource"
SET "statusUpdatedAt" = COALESCE("lastProcessedAt", "createdAt");

CREATE INDEX "VideoSource_platform_videoId_idx" ON "VideoSource"("platform", "videoId");
