-- DropIndex
DROP INDEX "Session_token_key";

-- AlterTable
ALTER TABLE "Session" DROP COLUMN "token";
