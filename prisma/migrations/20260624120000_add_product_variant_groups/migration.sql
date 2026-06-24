-- Restores variant data (color/size dropdowns) lost during the nopCommerce migration.
-- Additive only — nullable JSONB column.
ALTER TABLE "Product" ADD COLUMN "variantGroups" JSONB;
