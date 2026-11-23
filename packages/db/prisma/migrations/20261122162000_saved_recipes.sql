CREATE TABLE "SavedRecipe" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "recipe" JSONB NOT NULL,
    "sourceVideo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedRecipe_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SavedRecipe_userId_fkey" FOREIGN KEY ("userId")
      REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "SavedRecipe_userId_fingerprint_key"
  ON "SavedRecipe"("userId", "fingerprint");
CREATE INDEX "SavedRecipe_userId_createdAt_idx"
  ON "SavedRecipe"("userId", "createdAt");
