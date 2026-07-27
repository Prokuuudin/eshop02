ALTER TABLE "User"
ADD COLUMN "privacyNoticeVersion" TEXT,
ADD COLUMN "privacyAcknowledgedAt" TIMESTAMP(3),
ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marketingConsentAt" TIMESTAMP(3);

ALTER TABLE "AccessRequest"
ADD COLUMN "privacyNoticeVersion" TEXT NOT NULL DEFAULT '2026-07-03',
ADD COLUMN "privacyAcknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "marketingConsentAt" TIMESTAMP(3);
