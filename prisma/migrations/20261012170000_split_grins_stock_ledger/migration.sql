-- Split the physical GrinS snapshot from local order holds. All new columns
-- are nullable/defaulted so deploying the schema does not enable the ledger.
ALTER TABLE "Product"
  ADD COLUMN "grinsStock" INTEGER,
  ADD COLUMN "grinsStockUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "grinsStockRunId" TEXT;

ALTER TABLE "SyncRun"
  ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'full',
  ADD COLUMN "sourceIdentity" TEXT,
  ADD COLUMN "sourceSha256" TEXT,
  ADD COLUMN "sourceRunStartedAt" TIMESTAMP(3),
  ADD COLUMN "sourceGeneratedAt" TIMESTAMP(3);

CREATE TABLE "StockAllocation" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "eventKey" TEXT NOT NULL,
  "acknowledgmentId" TEXT,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "reconciledAt" TIMESTAMP(3),
  "reconciledSyncRunId" TEXT,
  "releasedAt" TIMESTAMP(3),
  "releaseReason" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "StockAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "StockAllocation_quantity_check" CHECK ("quantity" > 0),
  CONSTRAINT "StockAllocation_status_check" CHECK ("status" IN ('reserved', 'committed', 'awaiting_grins_sync', 'reconciled', 'released')),
  CONSTRAINT "StockAllocation_state_fields_check" CHECK (
    ("status" IN ('reserved', 'committed')
      AND "acknowledgmentId" IS NULL AND "acknowledgedAt" IS NULL AND "acknowledgedBy" IS NULL
      AND "reconciledAt" IS NULL AND "reconciledSyncRunId" IS NULL
      AND "releasedAt" IS NULL AND "releaseReason" IS NULL)
    OR ("status" = 'awaiting_grins_sync'
      AND "acknowledgmentId" IS NOT NULL AND "acknowledgedAt" IS NOT NULL AND "acknowledgedBy" IS NOT NULL
      AND "reconciledAt" IS NULL AND "reconciledSyncRunId" IS NULL
      AND "releasedAt" IS NULL AND "releaseReason" IS NULL)
    OR ("status" = 'reconciled'
      AND "acknowledgmentId" IS NOT NULL AND "acknowledgedAt" IS NOT NULL AND "acknowledgedBy" IS NOT NULL
      AND "reconciledAt" IS NOT NULL AND "reconciledSyncRunId" IS NOT NULL
      AND "releasedAt" IS NULL AND "releaseReason" IS NULL)
    OR ("status" = 'released'
      AND "acknowledgmentId" IS NULL AND "acknowledgedAt" IS NULL AND "acknowledgedBy" IS NULL
      AND "reconciledAt" IS NULL AND "reconciledSyncRunId" IS NULL
      AND "releasedAt" IS NOT NULL AND "releaseReason" IS NOT NULL)
  )
);

CREATE TABLE "StockSnapshotEntry" (
  "runId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "previousGrinsStock" INTEGER,
  "previousStock" INTEGER NOT NULL,
  "previousGrinsStockRunId" TEXT,
  "incomingGrinsStock" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "StockSnapshotEntry_pkey" PRIMARY KEY ("runId", "productId"),
  CONSTRAINT "StockSnapshotEntry_values_check" CHECK (
    ("previousGrinsStock" IS NULL OR "previousGrinsStock" >= 0)
    AND "previousStock" >= 0
    AND "incomingGrinsStock" >= 0
  )
);

CREATE UNIQUE INDEX "SyncRun_sourceIdentity_key" ON "SyncRun"("sourceIdentity");
CREATE INDEX "SyncRun_mode_sourceRunStartedAt_idx" ON "SyncRun"("mode", "sourceRunStartedAt");
CREATE UNIQUE INDEX "StockAllocation_eventKey_key" ON "StockAllocation"("eventKey");
CREATE UNIQUE INDEX "StockAllocation_acknowledgmentId_key" ON "StockAllocation"("acknowledgmentId");
CREATE INDEX "StockAllocation_orderId_status_idx" ON "StockAllocation"("orderId", "status");
CREATE INDEX "StockAllocation_productId_status_idx" ON "StockAllocation"("productId", "status");
CREATE INDEX "StockAllocation_status_acknowledgedAt_idx" ON "StockAllocation"("status", "acknowledgedAt");
CREATE INDEX "StockAllocation_reconciledSyncRunId_idx" ON "StockAllocation"("reconciledSyncRunId");
CREATE INDEX "Product_grinsStockRunId_idx" ON "Product"("grinsStockRunId");
CREATE INDEX "StockSnapshotEntry_productId_createdAt_idx" ON "StockSnapshotEntry"("productId", "createdAt");

ALTER TABLE "Product"
  -- Do not make deployment depend on unknown historical rows. These checks
  -- enforce every subsequent write immediately; cutover preflight validates
  -- historical rows before enabling the ledger.
  ADD CONSTRAINT "Product_stock_nonnegative_check" CHECK ("stock" >= 0) NOT VALID,
  ADD CONSTRAINT "Product_grinsStock_nonnegative_check" CHECK ("grinsStock" IS NULL OR "grinsStock" >= 0) NOT VALID,
  ADD CONSTRAINT "Product_grinsStockRunId_fkey" FOREIGN KEY ("grinsStockRunId") REFERENCES "SyncRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockAllocation"
  ADD CONSTRAINT "StockAllocation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAllocation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockAllocation_reconciledSyncRunId_fkey" FOREIGN KEY ("reconciledSyncRunId") REFERENCES "SyncRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "StockSnapshotEntry"
  ADD CONSTRAINT "StockSnapshotEntry_runId_fkey" FOREIGN KEY ("runId") REFERENCES "SyncRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "StockSnapshotEntry_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Once grinsStock is populated, direct stock writes are rejected unless the
-- transaction explicitly enters the stock-ledger write context. Before cutover
-- grinsStock remains NULL, so the legacy application continues unchanged.
CREATE OR REPLACE FUNCTION "guard_erp_stock_ledger_write"() RETURNS trigger AS $$
BEGIN
  IF (OLD."grinsStock" IS NOT NULL OR NEW."grinsStock" IS NOT NULL)
     AND (OLD."stock" IS DISTINCT FROM NEW."stock"
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
BEFORE UPDATE OF "stock", "grinsStock", "grinsStockRunId", "grinsStockUpdatedAt" ON "Product"
FOR EACH ROW EXECUTE FUNCTION "guard_erp_stock_ledger_write"();
