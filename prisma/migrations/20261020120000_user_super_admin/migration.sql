-- Super Admin flag (additive). Every existing row gets false; the two approved Super Admins are
-- assigned by a separate, guarded ops step BEFORE the code that enforces the flag is deployed.
ALTER TABLE "User" ADD COLUMN "superAdmin" BOOLEAN NOT NULL DEFAULT false;
