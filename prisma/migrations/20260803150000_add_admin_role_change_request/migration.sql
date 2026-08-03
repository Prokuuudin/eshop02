-- CreateTable
CREATE TABLE "AdminRoleChangeRequest" (
    "id" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "requestedRole" TEXT NOT NULL,
    "expectedUpdatedAt" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "AdminRoleChangeRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdminRoleChangeRequest_status_expiresAt_idx" ON "AdminRoleChangeRequest"("status", "expiresAt");

-- CreateIndex
CREATE INDEX "AdminRoleChangeRequest_targetUserId_status_idx" ON "AdminRoleChangeRequest"("targetUserId", "status");
