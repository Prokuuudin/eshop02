-- Hairshop taxonomy sync v2: persistent snapshot staging and source mirror.
-- Purely additive: creates six new tables and touches no existing table.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

CREATE TABLE "TaxonomySnapshotSession" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "mode" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'receiving',
  "manifest" JSONB NOT NULL,
  "snapshotSha256" TEXT NOT NULL,
  "expectedBatchCount" INTEGER NOT NULL,
  "generatedAtUtc" TIMESTAMP(3) NOT NULL,
  "finalizedAt" TIMESTAMP(3),
  "appliedAt" TIMESTAMP(3),
  "rejectedAt" TIMESTAMP(3),
  "lastErrorCode" TEXT,
  "lastErrorAt" TIMESTAMP(3),
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TaxonomySnapshotSession_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxonomySnapshotSession_mode_check" CHECK ("mode" IN ('dry-run', 'apply')),
  CONSTRAINT "TaxonomySnapshotSession_status_check" CHECK ("status" IN ('receiving', 'completed', 'rejected', 'expired')),
  CONSTRAINT "TaxonomySnapshotSession_batch_count_check" CHECK ("expectedBatchCount" >= 0),
  CONSTRAINT "TaxonomySnapshotSession_error_count_check" CHECK ("errorCount" >= 0),
  CONSTRAINT "TaxonomySnapshotSession_sha256_check" CHECK ("snapshotSha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "TaxonomySnapshotSession_completed_check" CHECK (("status" = 'completed') = ("finalizedAt" IS NOT NULL)),
  CONSTRAINT "TaxonomySnapshotSession_applied_check" CHECK ("appliedAt" IS NULL OR ("status" = 'completed' AND "mode" = 'apply'))
);

CREATE TABLE "TaxonomySnapshotBatch" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "batchIndex" INTEGER NOT NULL,
  "batchTotal" INTEGER NOT NULL,
  "checksum" TEXT NOT NULL,
  "itemCount" INTEGER NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "TaxonomySnapshotBatch_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxonomySnapshotBatch_type_check" CHECK ("type" IN ('categories', 'manufacturers', 'productCategories', 'productManufacturers')),
  CONSTRAINT "TaxonomySnapshotBatch_index_check" CHECK ("batchIndex" >= 0 AND "batchTotal" > 0 AND "batchIndex" < "batchTotal"),
  CONSTRAINT "TaxonomySnapshotBatch_item_count_check" CHECK ("itemCount" > 0),
  CONSTRAINT "TaxonomySnapshotBatch_batch_id_check" CHECK ("batchId" = "type" || ':' || "batchIndex"),
  CONSTRAINT "TaxonomySnapshotBatch_sha256_check" CHECK ("checksum" ~ '^[0-9a-f]{64}$')
);

CREATE TABLE "CatalogSourceCategory" (
  "source" TEXT NOT NULL,
  "sourceCategoryId" TEXT NOT NULL,
  "parentSourceCategoryId" TEXT,
  "names" JSONB NOT NULL,
  "slugs" JSONB NOT NULL,
  "published" BOOLEAN NOT NULL,
  "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "isPresent" BOOLEAN NOT NULL DEFAULT true,
  "missingSnapshotCount" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenSnapshotId" TEXT NOT NULL,
  "missingSinceAt" TIMESTAMP(3),
  "missingSinceSnapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatalogSourceCategory_pkey" PRIMARY KEY ("source", "sourceCategoryId"),
  CONSTRAINT "CatalogSourceCategory_not_self_parent_check" CHECK ("parentSourceCategoryId" IS NULL OR "parentSourceCategoryId" <> "sourceCategoryId"),
  CONSTRAINT "CatalogSourceCategory_presence_check" CHECK (
    ("isPresent" AND "missingSnapshotCount" = 0 AND "missingSinceAt" IS NULL AND "missingSinceSnapshotId" IS NULL)
    OR (NOT "isPresent" AND "missingSnapshotCount" > 0 AND "missingSinceAt" IS NOT NULL AND "missingSinceSnapshotId" IS NOT NULL)
  )
);

CREATE TABLE "CatalogSourceManufacturer" (
  "source" TEXT NOT NULL,
  "sourceManufacturerId" TEXT NOT NULL,
  "names" JSONB NOT NULL,
  "slugs" JSONB NOT NULL,
  "published" BOOLEAN NOT NULL,
  "sourceCreatedAt" TIMESTAMP(3) NOT NULL,
  "sourceUpdatedAt" TIMESTAMP(3) NOT NULL,
  "isPresent" BOOLEAN NOT NULL DEFAULT true,
  "missingSnapshotCount" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenSnapshotId" TEXT NOT NULL,
  "missingSinceAt" TIMESTAMP(3),
  "missingSinceSnapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatalogSourceManufacturer_pkey" PRIMARY KEY ("source", "sourceManufacturerId"),
  CONSTRAINT "CatalogSourceManufacturer_presence_check" CHECK (
    ("isPresent" AND "missingSnapshotCount" = 0 AND "missingSinceAt" IS NULL AND "missingSinceSnapshotId" IS NULL)
    OR (NOT "isPresent" AND "missingSnapshotCount" > 0 AND "missingSinceAt" IS NOT NULL AND "missingSinceSnapshotId" IS NOT NULL)
  )
);

CREATE TABLE "CatalogSourceProductCategory" (
  "source" TEXT NOT NULL,
  "legacyProductId" TEXT NOT NULL,
  "sourceCategoryId" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "isFeaturedProduct" BOOLEAN NOT NULL,
  "isPresent" BOOLEAN NOT NULL DEFAULT true,
  "missingSnapshotCount" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenSnapshotId" TEXT NOT NULL,
  "missingSinceAt" TIMESTAMP(3),
  "missingSinceSnapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatalogSourceProductCategory_pkey" PRIMARY KEY ("source", "legacyProductId", "sourceCategoryId"),
  CONSTRAINT "CatalogSourceProductCategory_presence_check" CHECK (
    ("isPresent" AND "missingSnapshotCount" = 0 AND "missingSinceAt" IS NULL AND "missingSinceSnapshotId" IS NULL)
    OR (NOT "isPresent" AND "missingSnapshotCount" > 0 AND "missingSinceAt" IS NOT NULL AND "missingSinceSnapshotId" IS NOT NULL)
  )
);

CREATE TABLE "CatalogSourceProductManufacturer" (
  "source" TEXT NOT NULL,
  "legacyProductId" TEXT NOT NULL,
  "sourceManufacturerId" TEXT NOT NULL,
  "displayOrder" INTEGER NOT NULL,
  "isFeaturedProduct" BOOLEAN NOT NULL,
  "isPresent" BOOLEAN NOT NULL DEFAULT true,
  "missingSnapshotCount" INTEGER NOT NULL DEFAULT 0,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL,
  "lastSeenSnapshotId" TEXT NOT NULL,
  "missingSinceAt" TIMESTAMP(3),
  "missingSinceSnapshotId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "CatalogSourceProductManufacturer_pkey" PRIMARY KEY ("source", "legacyProductId", "sourceManufacturerId"),
  CONSTRAINT "CatalogSourceProductManufacturer_presence_check" CHECK (
    ("isPresent" AND "missingSnapshotCount" = 0 AND "missingSinceAt" IS NULL AND "missingSinceSnapshotId" IS NULL)
    OR (NOT "isPresent" AND "missingSnapshotCount" > 0 AND "missingSinceAt" IS NOT NULL AND "missingSinceSnapshotId" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "TaxonomySnapshotSession_source_runId_key" ON "TaxonomySnapshotSession"("source", "runId");
CREATE INDEX "TaxonomySnapshotSession_source_status_createdAt_idx" ON "TaxonomySnapshotSession"("source", "status", "createdAt");
CREATE INDEX "TaxonomySnapshotSession_source_appliedAt_idx" ON "TaxonomySnapshotSession"("source", "appliedAt");

CREATE UNIQUE INDEX "TaxonomySnapshotBatch_sessionId_batchId_key" ON "TaxonomySnapshotBatch"("sessionId", "batchId");
CREATE UNIQUE INDEX "TaxonomySnapshotBatch_sessionId_type_batchIndex_key" ON "TaxonomySnapshotBatch"("sessionId", "type", "batchIndex");

CREATE INDEX "CatalogSourceCategory_source_parentSourceCategoryId_idx" ON "CatalogSourceCategory"("source", "parentSourceCategoryId");
CREATE INDEX "CatalogSourceCategory_source_isPresent_idx" ON "CatalogSourceCategory"("source", "isPresent");
CREATE INDEX "CatalogSourceCategory_lastSeenSnapshotId_idx" ON "CatalogSourceCategory"("lastSeenSnapshotId");
CREATE INDEX "CatalogSourceCategory_missingSinceSnapshotId_idx" ON "CatalogSourceCategory"("missingSinceSnapshotId");

CREATE INDEX "CatalogSourceManufacturer_source_isPresent_idx" ON "CatalogSourceManufacturer"("source", "isPresent");
CREATE INDEX "CatalogSourceManufacturer_lastSeenSnapshotId_idx" ON "CatalogSourceManufacturer"("lastSeenSnapshotId");
CREATE INDEX "CatalogSourceManufacturer_missingSinceSnapshotId_idx" ON "CatalogSourceManufacturer"("missingSinceSnapshotId");

CREATE INDEX "CatalogSourceProductCategory_source_sourceCategoryId_idx" ON "CatalogSourceProductCategory"("source", "sourceCategoryId");
CREATE INDEX "CatalogSourceProductCategory_source_legacyProductId_isPrese_idx" ON "CatalogSourceProductCategory"("source", "legacyProductId", "isPresent");
CREATE INDEX "CatalogSourceProductCategory_lastSeenSnapshotId_idx" ON "CatalogSourceProductCategory"("lastSeenSnapshotId");
CREATE INDEX "CatalogSourceProductCategory_missingSinceSnapshotId_idx" ON "CatalogSourceProductCategory"("missingSinceSnapshotId");

CREATE INDEX "CatalogSourceProductManufacturer_source_sourceManufacturerI_idx" ON "CatalogSourceProductManufacturer"("source", "sourceManufacturerId");
CREATE INDEX "CatalogSourceProductManufacturer_source_legacyProductId_isP_idx" ON "CatalogSourceProductManufacturer"("source", "legacyProductId", "isPresent");
CREATE INDEX "CatalogSourceProductManufacturer_lastSeenSnapshotId_idx" ON "CatalogSourceProductManufacturer"("lastSeenSnapshotId");
CREATE INDEX "CatalogSourceProductManufacturer_missingSinceSnapshotId_idx" ON "CatalogSourceProductManufacturer"("missingSinceSnapshotId");

ALTER TABLE "TaxonomySnapshotBatch"
  ADD CONSTRAINT "TaxonomySnapshotBatch_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The parent edge is deferred so a single snapshot may re-parent categories in any row order.
ALTER TABLE "CatalogSourceCategory"
  ADD CONSTRAINT "CatalogSourceCategory_source_parentSourceCategoryId_fkey" FOREIGN KEY ("source", "parentSourceCategoryId") REFERENCES "CatalogSourceCategory"("source", "sourceCategoryId") ON DELETE RESTRICT ON UPDATE CASCADE DEFERRABLE INITIALLY DEFERRED,
  ADD CONSTRAINT "CatalogSourceCategory_lastSeenSnapshotId_fkey" FOREIGN KEY ("lastSeenSnapshotId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CatalogSourceCategory_missingSinceSnapshotId_fkey" FOREIGN KEY ("missingSinceSnapshotId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CatalogSourceManufacturer"
  ADD CONSTRAINT "CatalogSourceManufacturer_lastSeenSnapshotId_fkey" FOREIGN KEY ("lastSeenSnapshotId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CatalogSourceManufacturer_missingSinceSnapshotId_fkey" FOREIGN KEY ("missingSinceSnapshotId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CatalogSourceProductCategory"
  ADD CONSTRAINT "CatalogSourceProductCategory_source_sourceCategoryId_fkey" FOREIGN KEY ("source", "sourceCategoryId") REFERENCES "CatalogSourceCategory"("source", "sourceCategoryId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CatalogSourceProductCategory_lastSeenSnapshotId_fkey" FOREIGN KEY ("lastSeenSnapshotId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CatalogSourceProductCategory_missingSinceSnapshotId_fkey" FOREIGN KEY ("missingSinceSnapshotId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CatalogSourceProductManufacturer"
  ADD CONSTRAINT "CatalogSourceProductManufacturer_source_sourceManufacturer_fkey" FOREIGN KEY ("source", "sourceManufacturerId") REFERENCES "CatalogSourceManufacturer"("source", "sourceManufacturerId") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CatalogSourceProductManufacturer_lastSeenSnapshotId_fkey" FOREIGN KEY ("lastSeenSnapshotId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "CatalogSourceProductManufacturer_missingSinceSnapshotId_fkey" FOREIGN KEY ("missingSinceSnapshotId") REFERENCES "TaxonomySnapshotSession"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
