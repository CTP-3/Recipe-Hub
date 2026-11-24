ALTER TABLE "VideoSource"
  ADD COLUMN "sourcePlatform" TEXT,
  ADD COLUMN "sourceVideoUrl" TEXT,
  ADD COLUMN "sourceVideoId" TEXT,
  ADD COLUMN "sourceCreatorUsername" TEXT,
  ADD COLUMN "sourceCreatorName" TEXT,
  ADD COLUMN "sourceCreatorProfileUrl" TEXT;

UPDATE "VideoSource"
SET
  "sourcePlatform" = "platform",
  "sourceVideoUrl" = COALESCE("canonicalUrl", "originalUrl"),
  "sourceVideoId" = "videoId"
WHERE "sourceType" = 'LINK';
