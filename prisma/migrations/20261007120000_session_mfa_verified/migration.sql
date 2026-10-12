-- Additive: sessions created before this migration default to false, so every
-- admin-capable user must re-authenticate with MFA once after deploy.
ALTER TABLE "Session" ADD COLUMN "mfaVerified" BOOLEAN NOT NULL DEFAULT false;
