-- Retail (B2C) pricing foundation. Additive only: new nullable/defaulted Product columns
-- and a new table. No existing column, index or row is changed. ADD COLUMN with a
-- constant default is metadata-only on PostgreSQL 11+ (no table rewrite).
--
-- DO NOT apply to production without the owner's explicit approval of this step.
-- Deploy order: apply this migration first, then deploy code that knows these columns
-- (Prisma reads all scalar columns when a query has no explicit select).
--
-- Rollback (only while no code depends on the columns):
--   DROP TABLE "B2cPriceHistory";
--   ALTER TABLE "Product" DROP COLUMN "b2cBasePrice", DROP COLUMN "b2cBasePriceSource",
--     DROP COLUMN "b2cBasePriceUpdatedAt", DROP COLUMN "retailPrice",
--     DROP COLUMN "retailPriceMissing", DROP COLUMN "retailPriceUpdatedAt";

-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "b2cBasePrice" DECIMAL(12,2),
ADD COLUMN     "b2cBasePriceSource" TEXT,
ADD COLUMN     "b2cBasePriceUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "retailPrice" DECIMAL(12,2),
ADD COLUMN     "retailPriceMissing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "retailPriceUpdatedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "B2cPriceHistory" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "B2cPriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "B2cPriceHistory_productId_kind_validFrom_idx" ON "B2cPriceHistory"("productId", "kind", "validFrom");
