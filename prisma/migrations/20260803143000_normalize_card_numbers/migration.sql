-- Leading zeroes are display padding, not part of a card's identity.
-- Abort if legacy rows would collapse onto the same unique value.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM (
      SELECT CASE WHEN regexp_replace("cardNumber", '^0+', '') = '' THEN '0'
                  ELSE regexp_replace("cardNumber", '^0+', '') END
      FROM "User" WHERE "cardNumber" ~ '^\d+$'
      GROUP BY 1 HAVING count(*) > 1
    ) collisions
  ) THEN
    RAISE EXCEPTION 'Cannot normalize User.cardNumber: leading-zero collision detected';
  END IF;

  IF EXISTS (
    SELECT 1 FROM (
      SELECT CASE WHEN regexp_replace("cardNumber", '^0+', '') = '' THEN '0'
                  ELSE regexp_replace("cardNumber", '^0+', '') END
      FROM "Company" WHERE "cardNumber" ~ '^\d+$'
      GROUP BY 1 HAVING count(*) > 1
    ) collisions
  ) THEN
    RAISE EXCEPTION 'Cannot normalize Company.cardNumber: leading-zero collision detected';
  END IF;
END $$;

UPDATE "User" SET "cardNumber" = CASE
  WHEN regexp_replace("cardNumber", '^0+', '') = '' THEN '0'
  ELSE regexp_replace("cardNumber", '^0+', '') END
WHERE "cardNumber" ~ '^\d+$';

UPDATE "Company" SET "cardNumber" = CASE
  WHEN regexp_replace("cardNumber", '^0+', '') = '' THEN '0'
  ELSE regexp_replace("cardNumber", '^0+', '') END
WHERE "cardNumber" ~ '^\d+$';

UPDATE "AccessRequest" SET "cardNumber" = CASE
  WHEN regexp_replace("cardNumber", '^0+', '') = '' THEN '0'
  ELSE regexp_replace("cardNumber", '^0+', '') END
WHERE "cardNumber" ~ '^\d+$';
