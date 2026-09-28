-- Remove the seven retail Hairshop price comparisons that were confirmed to be
-- leaking into the Hairshop Pro sale carousel. Every row is snapshot-guarded:
-- a later Pro edit makes the predicate fail instead of being overwritten.
WITH legacy_sale(id, sku, price, old_price) AS (
  VALUES
    ('22272', '7024604',   31.50::numeric, 45.00::numeric),
    ('22273', '7024567',   27.30::numeric, 39.00::numeric),
    ('22242', 'KJMN1917',  17.50::numeric, 22.00::numeric),
    ('13302', 'K6780',      5.20::numeric,  6.50::numeric),
    ('13321', 'K6781',      4.65::numeric,  5.80::numeric),
    ('20188', '100104033', 13.50::numeric, 16.79::numeric),
    ('18180', 'K1458',      6.30::numeric,  7.80::numeric)
)
UPDATE "Product" AS product
SET "oldPrice" = NULL,
    badges = array_remove(product.badges, 'sale')
FROM legacy_sale
WHERE product.id = legacy_sale.id
  AND product.sku = legacy_sale.sku
  AND product.price = legacy_sale.price
  AND product."oldPrice" = legacy_sale.old_price
  AND product."isCustom" = false
  AND product."isDeleted" = false;
