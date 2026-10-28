CREATE TABLE "OrderOperationalException" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'open',
  "productIds" JSONB NOT NULL,
  "paymentProvider" TEXT,
  "occurrences" INTEGER NOT NULL DEFAULT 1,
  "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolvedAt" TIMESTAMP(3),
  "resolvedBy" TEXT,

  CONSTRAINT "OrderOperationalException_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderOperationalException_occurrences_check" CHECK ("occurrences" > 0),
  CONSTRAINT "OrderOperationalException_status_check" CHECK ("status" IN ('open', 'resolved')),
  CONSTRAINT "OrderOperationalException_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "OrderOperationalException_orderId_code_key" ON "OrderOperationalException"("orderId", "code");
CREATE INDEX "OrderOperationalException_status_firstSeenAt_idx" ON "OrderOperationalException"("status", "firstSeenAt");
