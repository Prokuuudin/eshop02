CREATE TABLE "BonusTransaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "orderId" TEXT,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "actorUserId" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BonusTransaction_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BonusTransaction_userId_createdAt_idx" ON "BonusTransaction"("userId", "createdAt");
CREATE INDEX "BonusTransaction_orderId_idx" ON "BonusTransaction"("orderId");
CREATE INDEX "BonusTransaction_type_createdAt_idx" ON "BonusTransaction"("type", "createdAt");

ALTER TABLE "BonusTransaction"
ADD CONSTRAINT "BonusTransaction_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
