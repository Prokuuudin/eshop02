-- Stage 5: promo codes may target product lines (BrandLine ids).
-- Additive only: an array column with an empty default; existing promo
-- codes keep an empty list and behave exactly as before.
ALTER TABLE "PromoCode" ADD COLUMN "brandLineIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
