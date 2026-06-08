-- CreateTable: AccessRequest
CREATE TABLE "AccessRequest" (
    "id"               TEXT NOT NULL,
    "email"            TEXT NOT NULL,
    "passwordHash"     TEXT NOT NULL,
    "name"             TEXT,
    "phone"            TEXT,
    "companyId"        TEXT NOT NULL,
    "companyName"      TEXT NOT NULL,
    "cardNumber"       TEXT NOT NULL,
    "status"           TEXT NOT NULL DEFAULT 'pending',
    "requestedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt"       TIMESTAMP(3),
    "reviewedByUserId" TEXT,
    "reviewedByEmail"  TEXT,
    "approvedTeamRole" TEXT,
    "reviewNote"       TEXT,
    "requestType"      TEXT NOT NULL DEFAULT 'card',
    "certificateName"  TEXT,
    "message"          TEXT,
    "language"         TEXT,
    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable: SavedAddress
CREATE TABLE "SavedAddress" (
    "id"         TEXT NOT NULL,
    "email"      TEXT NOT NULL,
    "firstName"  TEXT NOT NULL,
    "lastName"   TEXT NOT NULL,
    "phone"      TEXT NOT NULL,
    "address"    TEXT NOT NULL,
    "city"       TEXT NOT NULL,
    "postalCode" TEXT,
    CONSTRAINT "SavedAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable: StockNotification
CREATE TABLE "StockNotification" (
    "id"           TEXT NOT NULL,
    "productId"    TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "email"        TEXT NOT NULL,
    "userId"       TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notified"     BOOLEAN NOT NULL DEFAULT false,
    "notifiedAt"   TIMESTAMP(3),
    CONSTRAINT "StockNotification_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ProductSubscription
CREATE TABLE "ProductSubscription" (
    "id"              TEXT NOT NULL,
    "userId"          TEXT NOT NULL,
    "userEmail"       TEXT NOT NULL,
    "productId"       TEXT NOT NULL,
    "productTitle"    TEXT NOT NULL,
    "productImage"    TEXT,
    "pricePerUnit"    DOUBLE PRECISION NOT NULL,
    "discountPercent" DOUBLE PRECISION NOT NULL,
    "quantity"        INTEGER NOT NULL,
    "interval"        TEXT NOT NULL,
    "status"          TEXT NOT NULL DEFAULT 'active',
    "nextOrderDate"   TIMESTAMP(3) NOT NULL,
    "lastOrderDate"   TIMESTAMP(3),
    "remindedAt"      TIMESTAMP(3),
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSubscription_pkey" PRIMARY KEY ("id")
);

-- Indexes: AccessRequest
CREATE INDEX "AccessRequest_email_idx" ON "AccessRequest"("email");
CREATE INDEX "AccessRequest_companyId_idx" ON "AccessRequest"("companyId");
CREATE INDEX "AccessRequest_status_idx" ON "AccessRequest"("status");
CREATE INDEX "AccessRequest_requestedAt_idx" ON "AccessRequest"("requestedAt");

-- Indexes: SavedAddress
CREATE INDEX "SavedAddress_email_idx" ON "SavedAddress"("email");

-- Indexes: StockNotification
CREATE UNIQUE INDEX "StockNotification_productId_email_key" ON "StockNotification"("productId", "email");
CREATE INDEX "StockNotification_productId_idx" ON "StockNotification"("productId");
CREATE INDEX "StockNotification_email_idx" ON "StockNotification"("email");
CREATE INDEX "StockNotification_notified_idx" ON "StockNotification"("notified");

-- Indexes: ProductSubscription
CREATE INDEX "ProductSubscription_userId_idx" ON "ProductSubscription"("userId");
CREATE INDEX "ProductSubscription_userEmail_idx" ON "ProductSubscription"("userEmail");
CREATE INDEX "ProductSubscription_status_idx" ON "ProductSubscription"("status");
CREATE INDEX "ProductSubscription_nextOrderDate_idx" ON "ProductSubscription"("nextOrderDate");
