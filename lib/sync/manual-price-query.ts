/** Dedicated prices-only SQL. Stock/availability/reservation fields are absent.
 * Rounding is also enforced in SQL as defense against a bypassed decoder. */
export function buildManualPriceQuery(count: number): string {
  const values = Array.from({ length: count }, (_, index) => `($${index * 2 + 1}::text,round($${index * 2 + 2}::numeric,2))`).join(',')
  return `UPDATE "Product" p SET
    price=v.price,
    revision=p.revision+1,"updatedAt"=now()
    FROM (VALUES ${values}) v("externalId",price)
    WHERE p."externalId"=v."externalId" AND NOT p."isDeleted"
      AND v.price>0 AND p.price IS DISTINCT FROM v.price`
}
