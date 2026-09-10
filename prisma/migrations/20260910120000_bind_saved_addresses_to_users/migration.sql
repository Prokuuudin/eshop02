-- Bind saved delivery addresses to immutable user IDs. Email remains as a
-- denormalized checkout/contact value, but is no longer an ownership key.
ALTER TABLE "SavedAddress" ADD COLUMN "userId" TEXT;

UPDATE "SavedAddress" AS address
SET "userId" = account."id"
FROM "User" AS account
WHERE lower(address."email") = lower(account."email");

CREATE INDEX "SavedAddress_userId_idx" ON "SavedAddress"("userId");

ALTER TABLE "SavedAddress"
ADD CONSTRAINT "SavedAddress_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
