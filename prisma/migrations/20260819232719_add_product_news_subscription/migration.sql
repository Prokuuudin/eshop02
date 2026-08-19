-- DropTable
DROP TABLE "ProductSubscription";

-- DropTable
DROP TABLE "StockNotification";

-- CreateTable
CREATE TABLE "ProductNewsSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "notifyPrice" BOOLEAN NOT NULL DEFAULT true,
    "notifyStock" BOOLEAN NOT NULL DEFAULT true,
    "notifyPromo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductNewsSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductNewsSubscription_productId_idx" ON "ProductNewsSubscription"("productId");

-- CreateIndex
CREATE INDEX "ProductNewsSubscription_userId_idx" ON "ProductNewsSubscription"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductNewsSubscription_userId_productId_key" ON "ProductNewsSubscription"("userId", "productId");

-- AddForeignKey
ALTER TABLE "ProductNewsSubscription" ADD CONSTRAINT "ProductNewsSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
