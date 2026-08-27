BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

ALTER TABLE "BonusTransaction"
ADD COLUMN "expiresAt" TIMESTAMP(3),
ADD COLUMN "remainingPoints" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "BonusTransaction_userId_expiresAt_idx"
ON "BonusTransaction"("userId", "expiresAt");

COMMIT;
