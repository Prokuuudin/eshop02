ALTER TABLE "Order" ADD COLUMN "country" TEXT NOT NULL DEFAULT 'LV';
ALTER TABLE "Order" ADD COLUMN "trackingNumber" TEXT, ADD COLUMN "trackingUrl" TEXT, ADD COLUMN "labelUrl" TEXT, ADD COLUMN "shipmentCarrier" TEXT;
