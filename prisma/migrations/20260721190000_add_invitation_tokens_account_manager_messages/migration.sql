CREATE TABLE "InvitationToken" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cardNumber" TEXT NOT NULL,
    "language" TEXT NOT NULL DEFAULT 'lv',
    "status" TEXT NOT NULL DEFAULT 'sent',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvitationToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "InvitationToken_tokenHash_key" ON "InvitationToken"("tokenHash");
CREATE INDEX "InvitationToken_userId_idx" ON "InvitationToken"("userId");
CREATE INDEX "InvitationToken_email_idx" ON "InvitationToken"("email");
CREATE INDEX "InvitationToken_expiresAt_idx" ON "InvitationToken"("expiresAt");
CREATE INDEX "InvitationToken_status_idx" ON "InvitationToken"("status");
ALTER TABLE "InvitationToken" ADD CONSTRAINT "InvitationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AccountManagerMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "senderType" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountManagerMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccountManagerMessage_companyId_createdAt_idx" ON "AccountManagerMessage"("companyId", "createdAt");
CREATE INDEX "AccountManagerMessage_authorId_idx" ON "AccountManagerMessage"("authorId");
ALTER TABLE "AccountManagerMessage" ADD CONSTRAINT "AccountManagerMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountManagerMessage" ADD CONSTRAINT "AccountManagerMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Raw invitation tokens from the legacy JSON store must not survive this migration.
DELETE FROM "KeyValueSetting" WHERE "key" = 'pro-invitations';
