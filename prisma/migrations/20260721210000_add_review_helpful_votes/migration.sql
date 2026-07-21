CREATE TABLE "ReviewHelpfulVote" (
    "id" TEXT NOT NULL,
    "reviewId" TEXT NOT NULL,
    "voterKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReviewHelpfulVote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ReviewHelpfulVote_reviewId_voterKey_key"
ON "ReviewHelpfulVote"("reviewId", "voterKey");
CREATE INDEX "ReviewHelpfulVote_voterKey_idx" ON "ReviewHelpfulVote"("voterKey");
CREATE INDEX "ReviewHelpfulVote_createdAt_idx" ON "ReviewHelpfulVote"("createdAt");
ALTER TABLE "ReviewHelpfulVote" ADD CONSTRAINT "ReviewHelpfulVote_reviewId_fkey"
FOREIGN KEY ("reviewId") REFERENCES "Review"("id") ON DELETE CASCADE ON UPDATE CASCADE;
