CREATE TYPE "VideoSourceType" AS ENUM ('LINK', 'UPLOAD');
CREATE TYPE "RecipeExtractionStatus" AS ENUM ('QUEUED', 'PROCESSING', 'READY', 'FAILED');
CREATE TYPE "RecipeVisibility" AS ENUM ('PRIVATE', 'PUBLIC');

CREATE TABLE "VideoSource" (
    "id" TEXT NOT NULL,
    "sourceType" "VideoSourceType" NOT NULL,
    "platform" TEXT,
    "originalUrl" TEXT,
    "canonicalUrl" TEXT,
    "videoId" TEXT,
    "sourceHash" TEXT NOT NULL,
    "status" "RecipeExtractionStatus" NOT NULL DEFAULT 'QUEUED',
    "errorMessage" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastProcessedAt" TIMESTAMP(3),
    CONSTRAINT "VideoSource_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GeneratedRecipe" (
    "id" TEXT NOT NULL,
    "videoSourceId" TEXT NOT NULL,
    "ownerId" TEXT,
    "title" TEXT NOT NULL,
    "recipe" JSONB NOT NULL,
    "transcript" TEXT,
    "ocrCandidates" JSONB,
    "model" TEXT,
    "coverImageKey" TEXT,
    "visibility" "RecipeVisibility" NOT NULL DEFAULT 'PRIVATE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GeneratedRecipe_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "GeneratedRecipe_videoSourceId_fkey" FOREIGN KEY ("videoSourceId")
      REFERENCES "VideoSource"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedRecipe_ownerId_fkey" FOREIGN KEY ("ownerId")
      REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

ALTER TABLE "SavedRecipe" ALTER COLUMN "recipe" DROP NOT NULL;
ALTER TABLE "SavedRecipe" ADD COLUMN "generatedRecipeId" TEXT;
ALTER TABLE "SavedRecipe" ADD CONSTRAINT "SavedRecipe_generatedRecipeId_fkey"
  FOREIGN KEY ("generatedRecipeId") REFERENCES "GeneratedRecipe"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX "VideoSource_sourceHash_key" ON "VideoSource"("sourceHash");
CREATE UNIQUE INDEX "GeneratedRecipe_videoSourceId_key" ON "GeneratedRecipe"("videoSourceId");
CREATE INDEX "GeneratedRecipe_visibility_createdAt_idx"
  ON "GeneratedRecipe"("visibility", "createdAt");
CREATE INDEX "GeneratedRecipe_ownerId_createdAt_idx"
  ON "GeneratedRecipe"("ownerId", "createdAt");
CREATE UNIQUE INDEX "SavedRecipe_userId_generatedRecipeId_key"
  ON "SavedRecipe"("userId", "generatedRecipeId");
