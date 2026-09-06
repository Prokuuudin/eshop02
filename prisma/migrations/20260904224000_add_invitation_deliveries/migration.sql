CREATE TABLE "InvitationDelivery" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "InvitationDelivery_userId_channel_sentAt_idx"
ON "InvitationDelivery"("userId", "channel", "sentAt");

CREATE INDEX "InvitationDelivery_status_sentAt_idx"
ON "InvitationDelivery"("status", "sentAt");

ALTER TABLE "InvitationDelivery"
ADD CONSTRAINT "InvitationDelivery_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
