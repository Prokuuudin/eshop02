ALTER TABLE "User"
ADD COLUMN "customerType" TEXT DEFAULT 'individual',
ADD COLUMN "registrationNumber" TEXT,
ADD COLUMN "vatNumber" TEXT,
ADD COLUMN "legalAddress" TEXT;

CREATE INDEX "User_customerType_idx" ON "User"("customerType");
CREATE INDEX "User_registrationNumber_idx" ON "User"("registrationNumber");
