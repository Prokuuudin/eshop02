-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "erpPriceMissing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "manualApprovedPrice" DECIMAL(12,2),
ADD COLUMN     "manualPriceApproved" BOOLEAN NOT NULL DEFAULT false;
