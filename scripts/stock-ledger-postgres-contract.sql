-- Test-only schema contract for a database created with `prisma db push`.
-- Production receives the same constraints and trigger from versioned migrations.
ALTER TABLE "Product"
  ADD CONSTRAINT "Product_stock_nonnegative_check" CHECK (stock >= 0),
  ADD CONSTRAINT "Product_grinsStock_nonnegative_check" CHECK ("grinsStock" IS NULL OR "grinsStock" >= 0);

ALTER TABLE "StockAllocation"
  ADD CONSTRAINT "StockAllocation_quantity_check" CHECK (quantity > 0),
  ADD CONSTRAINT "StockAllocation_status_check" CHECK (status IN ('reserved', 'committed', 'awaiting_grins_sync', 'reconciled', 'released')),
  ADD CONSTRAINT "StockAllocation_state_fields_check" CHECK (
    (status IN ('reserved', 'committed')
      AND "acknowledgmentId" IS NULL AND "acknowledgedAt" IS NULL AND "acknowledgedBy" IS NULL
      AND "reconciledAt" IS NULL AND "reconciledSyncRunId" IS NULL
      AND "releasedAt" IS NULL AND "releaseReason" IS NULL)
    OR (status = 'awaiting_grins_sync'
      AND "acknowledgmentId" IS NOT NULL AND "acknowledgedAt" IS NOT NULL AND "acknowledgedBy" IS NOT NULL
      AND "reconciledAt" IS NULL AND "reconciledSyncRunId" IS NULL
      AND "releasedAt" IS NULL AND "releaseReason" IS NULL)
    OR (status = 'reconciled'
      AND "acknowledgmentId" IS NOT NULL AND "acknowledgedAt" IS NOT NULL AND "acknowledgedBy" IS NOT NULL
      AND "reconciledAt" IS NOT NULL AND "reconciledSyncRunId" IS NOT NULL
      AND "releasedAt" IS NULL AND "releaseReason" IS NULL)
    OR (status = 'released'
      AND "acknowledgmentId" IS NULL AND "acknowledgedAt" IS NULL AND "acknowledgedBy" IS NULL
      AND "reconciledAt" IS NULL AND "reconciledSyncRunId" IS NULL
      AND "releasedAt" IS NOT NULL AND "releaseReason" IS NOT NULL)
  );

ALTER TABLE "StockSnapshotEntry"
  ADD CONSTRAINT "StockSnapshotEntry_values_check" CHECK (
    ("previousGrinsStock" IS NULL OR "previousGrinsStock" >= 0)
    AND "previousStock" >= 0
    AND "incomingGrinsStock" >= 0
  );

ALTER TABLE "OrderOperationalException"
  ADD CONSTRAINT "OrderOperationalException_occurrences_check" CHECK (occurrences > 0),
  ADD CONSTRAINT "OrderOperationalException_status_check" CHECK (status IN ('open', 'resolved'));

CREATE OR REPLACE FUNCTION "guard_erp_stock_ledger_write"() RETURNS trigger AS $$
BEGIN
  IF (OLD."grinsStock" IS NOT NULL OR NEW."grinsStock" IS NOT NULL)
     AND (OLD.stock IS DISTINCT FROM NEW.stock
       OR OLD."grinsStock" IS DISTINCT FROM NEW."grinsStock"
       OR OLD."grinsStockRunId" IS DISTINCT FROM NEW."grinsStockRunId"
       OR OLD."grinsStockUpdatedAt" IS DISTINCT FROM NEW."grinsStockUpdatedAt")
     AND COALESCE(current_setting('hairshop.stock_ledger_write', true), '') <> 'on' THEN
    RAISE EXCEPTION 'erp_stock_write_requires_ledger';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "Product_erp_stock_ledger_guard"
BEFORE UPDATE OF stock, "grinsStock", "grinsStockRunId", "grinsStockUpdatedAt" ON "Product"
FOR EACH ROW EXECUTE FUNCTION "guard_erp_stock_ledger_write"();
