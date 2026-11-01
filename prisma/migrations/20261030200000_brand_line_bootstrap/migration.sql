-- Hairshop Pro stage 3: BrandLine model, source-to-Pro mappings and review queue.
-- Purely additive: five new tables, one trigger on the new BrandLine table.
-- Existing tables (Product, prices, stock, orders, promotions) are not altered.
BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- CreateTable
CREATE TABLE "BrandLine" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "brandKey" TEXT NOT NULL,
    "parentId" TEXT,
    "slug" TEXT NOT NULL,
    "names" JSONB NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "origin" TEXT NOT NULL,
    "adminLocked" BOOLEAN NOT NULL DEFAULT false,
    "depth" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BrandLine_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "ProductBrandLine" (
    "productId" TEXT NOT NULL,
    "brandLineId" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "sourceCategoryId" TEXT,
    "isPresentInSource" BOOLEAN NOT NULL DEFAULT true,
    "missingSnapshotCount" INTEGER NOT NULL DEFAULT 0,
    "lastSeenSnapshotId" TEXT,
    "lastCheckedSnapshotId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductBrandLine_pkey" PRIMARY KEY ("productId","brandLineId")
);
-- CreateTable
CREATE TABLE "CatalogSourceManufacturerBrand" (
    "source" TEXT NOT NULL,
    "sourceManufacturerId" TEXT NOT NULL,
    "brandKey" TEXT,
    "status" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogSourceManufacturerBrand_pkey" PRIMARY KEY ("source","sourceManufacturerId")
);
-- CreateTable
CREATE TABLE "CatalogSourceCategoryMapping" (
    "source" TEXT NOT NULL,
    "sourceCategoryId" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "brandKey" TEXT,
    "brandLineId" TEXT,
    "status" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CatalogSourceCategoryMapping_pkey" PRIMARY KEY ("source","sourceCategoryId")
);
-- CreateTable
CREATE TABLE "BrandLineReviewItem" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "subjectKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "details" JSONB NOT NULL,
    "occurrences" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,
    CONSTRAINT "BrandLineReviewItem_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "BrandLine_key_key" ON "BrandLine"("key");
-- CreateIndex
CREATE INDEX "BrandLine_brandKey_status_idx" ON "BrandLine"("brandKey", "status");
-- CreateIndex
CREATE INDEX "BrandLine_parentId_idx" ON "BrandLine"("parentId");
-- CreateIndex
CREATE INDEX "ProductBrandLine_brandLineId_status_idx" ON "ProductBrandLine"("brandLineId", "status");
-- CreateIndex
CREATE INDEX "CatalogSourceManufacturerBrand_brandKey_idx" ON "CatalogSourceManufacturerBrand"("brandKey");
-- CreateIndex
CREATE INDEX "CatalogSourceCategoryMapping_brandLineId_idx" ON "CatalogSourceCategoryMapping"("brandLineId");
-- CreateIndex
CREATE INDEX "CatalogSourceCategoryMapping_brandKey_idx" ON "CatalogSourceCategoryMapping"("brandKey");
-- CreateIndex
CREATE INDEX "BrandLineReviewItem_status_reason_idx" ON "BrandLineReviewItem"("status", "reason");
-- CreateIndex
CREATE UNIQUE INDEX "BrandLineReviewItem_source_reason_subjectKey_key" ON "BrandLineReviewItem"("source", "reason", "subjectKey");
-- AddForeignKey
ALTER TABLE "BrandLine" ADD CONSTRAINT "BrandLine_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "BrandLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProductBrandLine" ADD CONSTRAINT "ProductBrandLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "ProductBrandLine" ADD CONSTRAINT "ProductBrandLine_brandLineId_fkey" FOREIGN KEY ("brandLineId") REFERENCES "BrandLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CatalogSourceManufacturerBrand" ADD CONSTRAINT "CatalogSourceManufacturerBrand_source_sourceManufacturerId_fkey" FOREIGN KEY ("source", "sourceManufacturerId") REFERENCES "CatalogSourceManufacturer"("source", "sourceManufacturerId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CatalogSourceCategoryMapping" ADD CONSTRAINT "CatalogSourceCategoryMapping_source_sourceCategoryId_fkey" FOREIGN KEY ("source", "sourceCategoryId") REFERENCES "CatalogSourceCategory"("source", "sourceCategoryId") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "CatalogSourceCategoryMapping" ADD CONSTRAINT "CatalogSourceCategoryMapping_brandLineId_fkey" FOREIGN KEY ("brandLineId") REFERENCES "BrandLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Invariants -----------------------------------------------------------------

ALTER TABLE "BrandLine"
  ADD CONSTRAINT "BrandLine_kind_check" CHECK ("kind" IN ('line', 'series', 'subbrand')),
  ADD CONSTRAINT "BrandLine_status_check" CHECK ("status" IN ('active', 'archived')),
  ADD CONSTRAINT "BrandLine_origin_check" CHECK ("origin" IN ('source_sync', 'admin')),
  ADD CONSTRAINT "BrandLine_depth_check" CHECK ("depth" BETWEEN 1 AND 6 AND (("parentId" IS NULL) = ("depth" = 1))),
  ADD CONSTRAINT "BrandLine_not_self_parent_check" CHECK ("parentId" IS NULL OR "parentId" <> "id"),
  ADD CONSTRAINT "BrandLine_key_check" CHECK ("key" LIKE "brandKey" || '/%' AND "slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

ALTER TABLE "ProductBrandLine"
  ADD CONSTRAINT "ProductBrandLine_origin_check" CHECK ("origin" IN ('source_sync', 'admin')),
  ADD CONSTRAINT "ProductBrandLine_status_check" CHECK ("status" IN ('active', 'excluded')),
  ADD CONSTRAINT "ProductBrandLine_presence_check" CHECK ("missingSnapshotCount" >= 0 AND "isPresentInSource" = ("missingSnapshotCount" = 0));

ALTER TABLE "CatalogSourceManufacturerBrand"
  ADD CONSTRAINT "CatalogSourceManufacturerBrand_status_check" CHECK ("status" IN ('confirmed', 'rejected') AND (("status" = 'confirmed') = ("brandKey" IS NOT NULL))),
  ADD CONSTRAINT "CatalogSourceManufacturerBrand_origin_check" CHECK ("origin" IN ('exact_name', 'alias', 'admin'));

ALTER TABLE "CatalogSourceCategoryMapping"
  ADD CONSTRAINT "CatalogSourceCategoryMapping_status_check" CHECK ("status" IN ('confirmed', 'rejected')),
  ADD CONSTRAINT "CatalogSourceCategoryMapping_origin_check" CHECK ("origin" IN ('exact_name', 'alias', 'audit_seed', 'auto_child_series', 'admin')),
  ADD CONSTRAINT "CatalogSourceCategoryMapping_target_check" CHECK (
    ("targetType" = 'brand' AND "brandKey" IS NOT NULL AND "brandLineId" IS NULL)
    OR ("targetType" = 'brand_line' AND "brandLineId" IS NOT NULL AND "brandKey" IS NULL)
    OR ("targetType" = 'ignore' AND "brandKey" IS NULL AND "brandLineId" IS NULL)
  );

ALTER TABLE "BrandLineReviewItem"
  ADD CONSTRAINT "BrandLineReviewItem_status_check" CHECK ("status" IN ('open', 'resolved', 'dismissed')),
  ADD CONSTRAINT "BrandLineReviewItem_occurrences_check" CHECK ("occurrences" >= 1);

-- Hierarchy guard: the parent must exist in the same brand one level up, and the
-- ancestor chain must not contain the row itself. A transaction advisory lock
-- serializes hierarchy changes so two concurrent re-parents cannot form a cycle.
CREATE OR REPLACE FUNCTION "guard_brand_line_hierarchy"() RETURNS trigger AS $$
DECLARE
  parent_brand TEXT;
  parent_depth INTEGER;
  cursor_id TEXT;
  steps INTEGER := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('brand-line-hierarchy'));
  IF TG_OP = 'UPDATE'
     AND (NEW."brandKey" IS DISTINCT FROM OLD."brandKey" OR NEW."depth" IS DISTINCT FROM OLD."depth")
     AND EXISTS (SELECT 1 FROM "BrandLine" WHERE "parentId" = NEW."id") THEN
    RAISE EXCEPTION 'brand_line_has_children';
  END IF;
  IF NEW."parentId" IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT "brandKey", "depth" INTO parent_brand, parent_depth FROM "BrandLine" WHERE "id" = NEW."parentId";
  IF NOT FOUND THEN
    RETURN NEW; -- reported by the foreign key
  END IF;
  IF parent_brand <> NEW."brandKey" THEN
    RAISE EXCEPTION 'brand_line_parent_brand_mismatch';
  END IF;
  IF NEW."depth" <> parent_depth + 1 THEN
    RAISE EXCEPTION 'brand_line_depth_mismatch';
  END IF;
  cursor_id := NEW."parentId";
  WHILE cursor_id IS NOT NULL LOOP
    IF cursor_id = NEW."id" THEN
      RAISE EXCEPTION 'brand_line_cycle';
    END IF;
    steps := steps + 1;
    IF steps > 16 THEN
      RAISE EXCEPTION 'brand_line_too_deep';
    END IF;
    SELECT "parentId" INTO cursor_id FROM "BrandLine" WHERE "id" = cursor_id;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "BrandLine_hierarchy_guard"
BEFORE INSERT OR UPDATE OF "parentId", "brandKey", "depth" ON "BrandLine"
FOR EACH ROW EXECUTE FUNCTION "guard_brand_line_hierarchy"();

COMMIT;
