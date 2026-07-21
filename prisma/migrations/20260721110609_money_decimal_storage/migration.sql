-- Money Decimal(12,2) storage migration
-- Converts 16 money fields across 6 tables from `double precision` to `numeric(12,2)`.
-- USING ROUND(col::numeric, 2) is used explicitly (rather than relying on Postgres's
-- default assignment cast) to make the intentional cent-level rounding cleanup of
-- accumulated float drift self-documenting in the migration itself.
-- See docs/superpowers/plans/2026-07-20-money-decimal-storage.md and
-- docs/superpowers/specs/2026-07-20-money-decimal-storage-design.md.

ALTER TABLE "Order"
  ALTER COLUMN "subtotal" TYPE numeric(12,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "tax" TYPE numeric(12,2) USING ROUND("tax"::numeric, 2),
  ALTER COLUMN "delivery" TYPE numeric(12,2) USING ROUND("delivery"::numeric, 2),
  ALTER COLUMN "discount" TYPE numeric(12,2) USING ROUND("discount"::numeric, 2),
  ALTER COLUMN "total" TYPE numeric(12,2) USING ROUND("total"::numeric, 2);

ALTER TABLE "Invoice"
  ALTER COLUMN "subtotal" TYPE numeric(12,2) USING ROUND("subtotal"::numeric, 2),
  ALTER COLUMN "taxAmount" TYPE numeric(12,2) USING ROUND("taxAmount"::numeric, 2),
  ALTER COLUMN "total" TYPE numeric(12,2) USING ROUND("total"::numeric, 2),
  ALTER COLUMN "paidAmount" TYPE numeric(12,2) USING ROUND("paidAmount"::numeric, 2),
  ALTER COLUMN "remainingAmount" TYPE numeric(12,2) USING ROUND("remainingAmount"::numeric, 2);

ALTER TABLE "Company"
  ALTER COLUMN "creditLimit" TYPE numeric(12,2) USING ROUND("creditLimit"::numeric, 2),
  ALTER COLUMN "usedCredit" TYPE numeric(12,2) USING ROUND("usedCredit"::numeric, 2);

ALTER TABLE "Product"
  ALTER COLUMN "price" TYPE numeric(12,2) USING ROUND("price"::numeric, 2),
  ALTER COLUMN "oldPrice" TYPE numeric(12,2) USING ROUND("oldPrice"::numeric, 2);

ALTER TABLE "ProductSubscription"
  ALTER COLUMN "pricePerUnit" TYPE numeric(12,2) USING ROUND("pricePerUnit"::numeric, 2);

ALTER TABLE "ReturnRequest"
  ALTER COLUMN "refundAmount" TYPE numeric(12,2) USING ROUND("refundAmount"::numeric, 2);
