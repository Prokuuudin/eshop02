ALTER TABLE "Order"
ADD COLUMN "stockReservationStatus" TEXT NOT NULL DEFAULT 'committed',
ADD COLUMN "stockReservedUntil" TIMESTAMP(3),
ADD COLUMN "stockReleasedAt" TIMESTAMP(3);

CREATE INDEX "Order_stockReservationStatus_stockReservedUntil_idx"
ON "Order"("stockReservationStatus", "stockReservedUntil");
