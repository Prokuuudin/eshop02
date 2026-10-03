-- Rollback for 20261003120000_competitor_pricing. Destroys all competitor pricing data.
-- Run only with explicit approval and after a backup/branch of the target database.
-- If the migration was registered, also: npx prisma migrate resolve --rolled-back 20261003120000_competitor_pricing
BEGIN;
DROP TABLE IF EXISTS "CompetitorPriceObservation";
DROP TABLE IF EXISTS "CompetitorProductMatch";
DROP TABLE IF EXISTS "PricingRecommendation";
DROP TABLE IF EXISTS "CompetitorProduct";
DROP TABLE IF EXISTS "CompetitorMonitorRun";
DROP TABLE IF EXISTS "Competitor";
COMMIT;
