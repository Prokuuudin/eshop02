-- Existing requests must not be presented as having acknowledged a notice when
-- that acknowledgement was never actually collected. New requests are still
-- required by the application to supply these values.
ALTER TABLE "AccessRequest"
ALTER COLUMN "privacyNoticeVersion" DROP NOT NULL,
ALTER COLUMN "privacyNoticeVersion" DROP DEFAULT,
ALTER COLUMN "privacyAcknowledgedAt" DROP NOT NULL,
ALTER COLUMN "privacyAcknowledgedAt" DROP DEFAULT;
