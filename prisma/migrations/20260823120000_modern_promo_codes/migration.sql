ALTER TABLE "PromoCode"
  ADD COLUMN "discountType" TEXT NOT NULL DEFAULT 'percentage',
  ADD COLUMN "discountValue" DOUBLE PRECISION,
  ADD COLUMN "maxDiscount" DOUBLE PRECISION,
  ADD COLUMN "minEligibleAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "perUserLimit" INTEGER,
  ADD COLUMN "startsAt" TIMESTAMP(3),
  ADD COLUMN "appliesTo" TEXT NOT NULL DEFAULT 'all',
  ADD COLUMN "productIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "brands" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "excludedProductIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "excludeSaleItems" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "firstOrderOnly" BOOLEAN NOT NULL DEFAULT false;

UPDATE "PromoCode" SET "discountValue" = "discount" WHERE "discountValue" IS NULL;

CREATE TABLE "PromoCodeRedemption" (
  "id" TEXT NOT NULL,
  "promoCodeId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "userId" TEXT,
  "email" TEXT NOT NULL,
  "discount" DECIMAL(12,2) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PromoCodeRedemption_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PromoCodeRedemption_promoCodeId_fkey" FOREIGN KEY ("promoCodeId") REFERENCES "PromoCode"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PromoCodeRedemption_orderId_key" ON "PromoCodeRedemption"("orderId");
CREATE INDEX "PromoCodeRedemption_promoCodeId_userId_idx" ON "PromoCodeRedemption"("promoCodeId", "userId");
CREATE INDEX "PromoCodeRedemption_promoCodeId_email_idx" ON "PromoCodeRedemption"("promoCodeId", "email");
