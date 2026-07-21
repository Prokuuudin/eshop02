-- Preserve only the newest pending request if legacy duplicates exist, then enforce
-- one pending request per normalized email atomically at the database level.
UPDATE "AccessRequest" AS older
SET "status" = 'rejected',
    "reviewNote" = COALESCE("reviewNote", 'Automatically closed as duplicate during migration'),
    "reviewedAt" = COALESCE("reviewedAt", CURRENT_TIMESTAMP)
WHERE "status" = 'pending'
  AND EXISTS (
    SELECT 1 FROM "AccessRequest" AS newer
    WHERE newer."status" = 'pending'
      AND lower(newer."email") = lower(older."email")
      AND (newer."requestedAt", newer."id") > (older."requestedAt", older."id")
  );

CREATE UNIQUE INDEX "AccessRequest_one_pending_email_key"
ON "AccessRequest" (lower("email"))
WHERE "status" = 'pending';
