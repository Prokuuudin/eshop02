-- CreateTable
CREATE TABLE "ReturnRequest" (
    "id"           TEXT NOT NULL,
    "orderId"      TEXT NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status"       TEXT NOT NULL DEFAULT 'pending',
    "reason"       TEXT NOT NULL,
    "comment"      TEXT,
    "items"        JSONB NOT NULL,
    "refundAmount" DOUBLE PRECISION NOT NULL,
    "firstName"    TEXT NOT NULL,
    "lastName"     TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "phone"        TEXT NOT NULL,
    "resolution"   TEXT,
    "resolvedAt"   TIMESTAMP(3),

    CONSTRAINT "ReturnRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RFQRequest" (
    "id"              TEXT NOT NULL,
    "companyId"       TEXT NOT NULL,
    "items"           JSONB NOT NULL,
    "notes"           TEXT NOT NULL DEFAULT '',
    "status"          TEXT NOT NULL DEFAULT 'pending',
    "quote"           JSONB,
    "timeline"        JSONB NOT NULL DEFAULT '[]',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT,

    CONSTRAINT "RFQRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnRequest_orderId_idx" ON "ReturnRequest"("orderId");
CREATE INDEX "ReturnRequest_email_idx" ON "ReturnRequest"("email");
CREATE INDEX "ReturnRequest_status_idx" ON "ReturnRequest"("status");
CREATE INDEX "ReturnRequest_createdAt_idx" ON "ReturnRequest"("createdAt");

-- CreateIndex
CREATE INDEX "RFQRequest_companyId_idx" ON "RFQRequest"("companyId");
CREATE INDEX "RFQRequest_status_idx" ON "RFQRequest"("status");
CREATE INDEX "RFQRequest_createdAt_idx" ON "RFQRequest"("createdAt");
