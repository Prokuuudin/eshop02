ALTER TABLE "BlogPost"
ADD COLUMN "status" TEXT NOT NULL DEFAULT 'published',
ADD COLUMN "publishedAt" TIMESTAMP(3),
ADD COLUMN "authorRole" TEXT,
ADD COLUMN "authorBio" TEXT;

CREATE INDEX "BlogPost_status_publishedAt_idx" ON "BlogPost"("status", "publishedAt");
