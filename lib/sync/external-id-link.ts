/**
 * Linking a Product to an ERP record must set its B2B price state in the same write, so a
 * freshly linked product is never sellable at a kept local price while waiting for the
 * next FULL sync:
 *  - positive ERP primary price (price2) → Product.price = price2, erpPriceMissing = false
 *    (exactly what FULL sync would write);
 *  - zero/missing/invalid ERP price data → price kept, erpPriceMissing = true (fail closed:
 *    unsellable until FULL sync sees a positive price2 or an admin approves a price).
 * A new link never inherits a manual approval.
 */
export type ExternalIdLink = { productId: string; externalId: string; erpPrimaryPrice: number | null | undefined }

export function erpPriceMissingForLink(erpPrimaryPrice: number | null | undefined): boolean {
  return !(typeof erpPrimaryPrice === 'number' && Number.isFinite(erpPrimaryPrice) && erpPrimaryPrice > 0)
}

/** Parameterized UPDATE that links still-unlinked products and initialises the price state atomically. */
export function buildExternalIdLinkUpdate(links: ExternalIdLink[]): { sql: string; params: [string[], string[], boolean[], Array<number | null>] } {
  return {
    sql: `UPDATE "Product" AS p
     SET "externalId" = v.external_id,
         price = CASE WHEN v.price_missing THEN p.price ELSE v.erp_price END,
         "erpPriceMissing" = v.price_missing,
         "manualPriceApproved" = false,
         "manualApprovedPrice" = NULL,
         "updatedAt" = now()
     FROM (SELECT unnest($1::text[]) AS id, unnest($2::text[]) AS external_id,
                  unnest($3::boolean[]) AS price_missing, unnest($4::numeric[]) AS erp_price) AS v
     WHERE p.id = v.id AND p."externalId" IS NULL`,
    params: [
      links.map((link) => link.productId),
      links.map((link) => link.externalId),
      links.map((link) => erpPriceMissingForLink(link.erpPrimaryPrice)),
      links.map((link) => (erpPriceMissingForLink(link.erpPrimaryPrice) ? null : link.erpPrimaryPrice as number)),
    ],
  }
}
