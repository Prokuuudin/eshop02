-- Manual rollback (only after the previous application code is redeployed):
ALTER TABLE "User" DROP COLUMN IF EXISTS "superAdmin";
DELETE FROM "_prisma_migrations" WHERE migration_name = '20261020120000_user_super_admin';
