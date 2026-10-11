/** Dedicated prices-only SQL. Stock/availability/reservation fields are absent.
 * Rounding is also enforced in SQL as defense against a bypassed decoder. */
export function buildManualPriceQuery(count: number): string {
  const values = Array.from({ length: count }, (_, index) => `($${index * 2 + 1}::text,round($${index * 2 + 2}::numeric,2))`).join(',')
  return `UPDATE "Product" p SET
    price=CASE WHEN v.price>0 THEN v.price ELSE p.price END,
    "erpPriceMissing"=NOT (v.price>0),
    "manualPriceApproved"=CASE WHEN v.price>0 THEN false ELSE p."manualPriceApproved" END,
    "manualApprovedPrice"=CASE WHEN v.price>0 THEN NULL ELSE p."manualApprovedPrice" END,
    revision=p.revision+1,"updatedAt"=now()
    FROM (VALUES ${values}) v("externalId",price)
    WHERE p."externalId"=v."externalId" AND NOT p."isDeleted"
      AND ((v.price>0 AND p.price IS DISTINCT FROM v.price)
        OR p."erpPriceMissing" IS DISTINCT FROM NOT (v.price>0)
        OR (v.price>0 AND (p."manualPriceApproved" OR p."manualApprovedPrice" IS NOT NULL)))`
}
