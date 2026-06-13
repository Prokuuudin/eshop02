-- Add ownership/tenant columns to Order (additive, nullable — safe for existing rows).
ALTER TABLE "Order" ADD COLUMN "userId" TEXT;
ALTER TABLE "Order" ADD COLUMN "companyId" TEXT;

CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_companyId_idx" ON "Order"("companyId");
