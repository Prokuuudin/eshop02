-- Column default only — existing rows keep whatever value they already have.
-- The old default (350) predates the bonus ledger (BonusTransaction) and let
-- every new User row silently start with untracked points. New rows now
-- start at 0; the welcome bonus is granted explicitly through the ledger.
ALTER TABLE "User" ALTER COLUMN "bonusPoints" SET DEFAULT 0;
