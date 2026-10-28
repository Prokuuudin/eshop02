BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE "OrderNotificationOutbox" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "notificationType" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "correlationId" TEXT,
    "paymentStatusOverride" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedAt" TIMESTAMP(3),
    "lockToken" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderNotificationOutbox_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "OrderNotificationOutbox_status_check"
      CHECK ("status" IN ('pending', 'processing', 'sent', 'failed')),
    CONSTRAINT "OrderNotificationOutbox_type_check"
      CHECK ("notificationType" IN ('admin_order_created')),
    CONSTRAINT "OrderNotificationOutbox_source_check"
      CHECK ("source" IN ('checkout', 'admin', 'api_v1')),
    CONSTRAINT "OrderNotificationOutbox_attempts_check"
      CHECK ("attempts" >= 0)
);

CREATE UNIQUE INDEX "OrderNotificationOutbox_orderId_notificationType_key"
ON "OrderNotificationOutbox"("orderId", "notificationType");

CREATE INDEX "OrderNotificationOutbox_status_nextAttemptAt_idx"
ON "OrderNotificationOutbox"("status", "nextAttemptAt");

CREATE INDEX "OrderNotificationOutbox_status_lockedAt_idx"
ON "OrderNotificationOutbox"("status", "lockedAt");

ALTER TABLE "OrderNotificationOutbox"
ADD CONSTRAINT "OrderNotificationOutbox_orderId_fkey"
FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

COMMIT;
