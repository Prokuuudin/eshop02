-- Competitor pricing monitor: additive only (6 new tables). No existing table or column changes.
-- PENDING: lives outside prisma/migrations on purpose (npm run build = prisma migrate deploy on prod).
-- Apply only to a non-production database until explicitly approved; rollback: rollback.sql (same folder,
-- never copy it into prisma/migrations).

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "hostname" TEXT NOT NULL,
    "allowedHosts" TEXT[],
    "adapterKey" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'active',
    "statusReason" TEXT,
    "accessBasisNote" TEXT NOT NULL,
    "pollIntervalMinutes" INTEGER NOT NULL DEFAULT 1440,
    "requestDelayMs" INTEGER NOT NULL DEFAULT 5000,
    "maxConcurrency" INTEGER NOT NULL DEFAULT 1,
    "timeoutMs" INTEGER NOT NULL DEFAULT 15000,
    "maxResponseBytes" INTEGER NOT NULL DEFAULT 2000000,
    "maxProductsPerRun" INTEGER NOT NULL DEFAULT 200,
    "lastCheckedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorAt" TIMESTAMP(3),
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorProduct" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "sourceProductId" TEXT,
    "title" TEXT,
    "brand" TEXT,
    "ean" TEXT,
    "manufacturerSku" TEXT,
    "sizeText" TEXT,
    "lastAvailability" TEXT,
    "lastObservedAt" TIMESTAMP(3),
    "monitoringState" TEXT NOT NULL DEFAULT 'active',
    "lastCheckAt" TIMESTAMP(3),
    "lastCheckStatus" TEXT,
    "lastError" TEXT,
    "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorProductMatch" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "competitorProductId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "confidence" DECIMAL(4,3),
    "exclusiveKey" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorProductMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPriceObservation" (
    "id" TEXT NOT NULL,
    "competitorProductId" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "regularPrice" DECIMAL(12,2),
    "salePrice" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL,
    "availability" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "seenCount" INTEGER NOT NULL DEFAULT 1,
    "firstRunId" TEXT,
    "lastRunId" TEXT,

    CONSTRAINT "CompetitorPriceObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingRecommendation" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "priceAuthority" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'EUR',
    "currentPrice" DECIMAL(12,2) NOT NULL,
    "recommendedPrice" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL,
    "differencePercent" DECIMAL(7,2) NOT NULL,
    "marketMin" DECIMAL(12,2) NOT NULL,
    "marketMedian" DECIMAL(12,2) NOT NULL,
    "marketMax" DECIMAL(12,2) NOT NULL,
    "competitorCount" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "reasonCode" TEXT NOT NULL,
    "reasonParams" JSONB,
    "inputSnapshot" JSONB NOT NULL,
    "inputHash" TEXT NOT NULL,
    "algorithmVersion" TEXT NOT NULL,
    "productRevision" INTEGER NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "openKey" TEXT,
    "closedReason" TEXT,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT,
    "appliedPrice" DECIMAL(12,2),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorMonitorRun" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'running',
    "triggeredBy" TEXT NOT NULL,
    "triggeredById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "competitorsAttempted" INTEGER NOT NULL DEFAULT 0,
    "competitorsSucceeded" INTEGER NOT NULL DEFAULT 0,
    "competitorsFailed" INTEGER NOT NULL DEFAULT 0,
    "competitorsBlocked" INTEGER NOT NULL DEFAULT 0,
    "productsChecked" INTEGER NOT NULL DEFAULT 0,
    "observationsCreated" INTEGER NOT NULL DEFAULT 0,
    "observationsUnchanged" INTEGER NOT NULL DEFAULT 0,
    "parseFailures" INTEGER NOT NULL DEFAULT 0,
    "fetchFailures" INTEGER NOT NULL DEFAULT 0,
    "errorSample" JSONB,
    "summary" JSONB,

    CONSTRAINT "CompetitorMonitorRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_hostname_key" ON "Competitor"("hostname");

-- CreateIndex
CREATE INDEX "Competitor_enabled_status_idx" ON "Competitor"("enabled", "status");

-- CreateIndex
CREATE INDEX "CompetitorProduct_competitorId_monitoringState_idx" ON "CompetitorProduct"("competitorId", "monitoringState");

-- CreateIndex
CREATE INDEX "CompetitorProduct_ean_idx" ON "CompetitorProduct"("ean");

-- CreateIndex
CREATE INDEX "CompetitorProduct_manufacturerSku_idx" ON "CompetitorProduct"("manufacturerSku");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorProduct_competitorId_url_key" ON "CompetitorProduct"("competitorId", "url");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorProductMatch_exclusiveKey_key" ON "CompetitorProductMatch"("exclusiveKey");

-- CreateIndex
CREATE INDEX "CompetitorProductMatch_competitorProductId_idx" ON "CompetitorProductMatch"("competitorProductId");

-- CreateIndex
CREATE INDEX "CompetitorProductMatch_productId_status_idx" ON "CompetitorProductMatch"("productId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorProductMatch_productId_competitorProductId_key" ON "CompetitorProductMatch"("productId", "competitorProductId");

-- CreateIndex
CREATE INDEX "CompetitorPriceObservation_competitorProductId_observedAt_idx" ON "CompetitorPriceObservation"("competitorProductId", "observedAt");

-- CreateIndex
CREATE INDEX "CompetitorPriceObservation_competitorId_observedAt_idx" ON "CompetitorPriceObservation"("competitorId", "observedAt");

-- CreateIndex
CREATE INDEX "CompetitorPriceObservation_observedAt_idx" ON "CompetitorPriceObservation"("observedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRecommendation_openKey_key" ON "PricingRecommendation"("openKey");

-- CreateIndex
CREATE INDEX "PricingRecommendation_productId_calculatedAt_idx" ON "PricingRecommendation"("productId", "calculatedAt");

-- CreateIndex
CREATE INDEX "PricingRecommendation_status_calculatedAt_idx" ON "PricingRecommendation"("status", "calculatedAt");

-- CreateIndex
CREATE INDEX "CompetitorMonitorRun_startedAt_idx" ON "CompetitorMonitorRun"("startedAt");

-- CreateIndex
CREATE INDEX "CompetitorMonitorRun_status_idx" ON "CompetitorMonitorRun"("status");

-- AddForeignKey
ALTER TABLE "CompetitorProduct" ADD CONSTRAINT "CompetitorProduct_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorProductMatch" ADD CONSTRAINT "CompetitorProductMatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorProductMatch" ADD CONSTRAINT "CompetitorProductMatch_competitorProductId_fkey" FOREIGN KEY ("competitorProductId") REFERENCES "CompetitorProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPriceObservation" ADD CONSTRAINT "CompetitorPriceObservation_competitorProductId_fkey" FOREIGN KEY ("competitorProductId") REFERENCES "CompetitorProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPriceObservation" ADD CONSTRAINT "CompetitorPriceObservation_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PricingRecommendation" ADD CONSTRAINT "PricingRecommendation_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Integrity guards Prisma does not model (CHECK constraints are not introspected, so they cause no drift).
-- A parse failure must never be stored as a 0 price.
ALTER TABLE "CompetitorPriceObservation"
  ADD CONSTRAINT "CompetitorPriceObservation_price_positive_check"
    CHECK (("regularPrice" IS NULL OR "regularPrice" > 0) AND ("salePrice" IS NULL OR "salePrice" > 0)),
  ADD CONSTRAINT "CompetitorPriceObservation_has_price_check"
    CHECK ("regularPrice" IS NOT NULL OR "salePrice" IS NOT NULL),
  ADD CONSTRAINT "CompetitorPriceObservation_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "PricingRecommendation"
  ADD CONSTRAINT "PricingRecommendation_prices_positive_check"
    CHECK ("currentPrice" > 0 AND "recommendedPrice" > 0 AND "marketMin" > 0),
  ADD CONSTRAINT "PricingRecommendation_market_order_check"
    CHECK ("marketMin" <= "marketMedian" AND "marketMedian" <= "marketMax"),
  ADD CONSTRAINT "PricingRecommendation_competitor_count_check"
    CHECK ("competitorCount" >= 1),
  ADD CONSTRAINT "PricingRecommendation_currency_check"
    CHECK ("currency" ~ '^[A-Z]{3}$');

ALTER TABLE "CompetitorProductMatch"
  ADD CONSTRAINT "CompetitorProductMatch_confidence_check"
    CHECK ("confidence" IS NULL OR ("confidence" >= 0 AND "confidence" <= 1));
