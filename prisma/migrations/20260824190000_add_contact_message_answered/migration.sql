ALTER TABLE "ContactMessage"
ADD COLUMN "answeredAt" TIMESTAMP(3),
ADD COLUMN "answeredById" TEXT;

CREATE INDEX "ContactMessage_answeredAt_createdAt_idx"
ON "ContactMessage"("answeredAt", "createdAt");
