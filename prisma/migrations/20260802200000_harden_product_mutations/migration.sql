ALTER TABLE "Product" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 1;

UPDATE "Product" SET "sku" = NULL WHERE "sku" IS NOT NULL AND btrim("sku") = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Product" WHERE "sku" IS NOT NULL
    GROUP BY lower("sku") HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce unique Product SKU: duplicate SKU values exist';
  END IF;
END $$;

CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");
CREATE UNIQUE INDEX "Product_sku_lower_key" ON "Product" (lower("sku")) WHERE "sku" IS NOT NULL;
