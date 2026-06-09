DROP INDEX IF EXISTS "Product_externalId_idx";
DROP INDEX IF EXISTS "Product_isActive_idx";
CREATE INDEX "Product_isDeleted_isActive_idx" ON "Product"("isDeleted", "isActive");
