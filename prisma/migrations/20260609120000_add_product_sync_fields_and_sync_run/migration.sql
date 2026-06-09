-- AlterTable: Product - add sync fields
ALTER TABLE "Product" ADD COLUMN "externalId" TEXT;
ALTER TABLE "Product" ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Product" ADD COLUMN "lastSyncRunId" TEXT;

-- CreateTable: SyncRun
CREATE TABLE "SyncRun" (
    "id"             TEXT NOT NULL,
    "startedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt"     TIMESTAMP(3),
    "status"         TEXT NOT NULL DEFAULT 'running',
    "productsTotal"  INTEGER NOT NULL DEFAULT 0,
    "productsSynced" INTEGER NOT NULL DEFAULT 0,
    "variantsSynced" INTEGER NOT NULL DEFAULT 0,
    "deactivated"    INTEGER NOT NULL DEFAULT 0,
    "errorCount"     INTEGER NOT NULL DEFAULT 0,
    "errorSample"    JSONB,
    "triggeredBy"    TEXT NOT NULL DEFAULT 'cron',
    CONSTRAINT "SyncRun_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: Product.externalId
CREATE UNIQUE INDEX "Product_externalId_key" ON "Product"("externalId");

-- Indexes: Product sync fields
CREATE INDEX "Product_externalId_idx" ON "Product"("externalId");
CREATE INDEX "Product_isActive_idx" ON "Product"("isActive");
CREATE INDEX "Product_lastSyncRunId_idx" ON "Product"("lastSyncRunId");

-- Indexes: SyncRun
CREATE INDEX "SyncRun_status_idx" ON "SyncRun"("status");
CREATE INDEX "SyncRun_startedAt_idx" ON "SyncRun"("startedAt");
