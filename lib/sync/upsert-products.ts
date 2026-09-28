import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { ErpProduct } from './erp-adapter'

// FULL_PRODUCT_SYNC is deliberately update-only. Identity discovery and product
// creation belong to separately reviewed, allowlisted import workflows.
export const COLS_PER_ROW = 3

export function buildUpsertQuery(rowCount: number): string {
  const values = Array.from({ length: rowCount }, (_, index) => {
    const base = index * COLS_PER_ROW
    return `($${base + 1}::text,$${base + 2}::numeric,$${base + 3}::integer)`
  }).join(',')

  // price2 <= 0 keeps the local Product.price (never written as 0) but marks the ERP B2B
  // price as missing, which makes the product unsellable unless an admin explicitly
  // approved the local price. A positive price2 restores the ERP price, clears the flag
  // and consumes any manual approval: the approval covered a local price, not the ERP one.
  return `
    UPDATE "Product" AS product
       SET price = CASE WHEN incoming.price > 0 THEN incoming.price ELSE product.price END,
           stock = incoming.stock,
           "erpPriceMissing" = NOT (COALESCE(incoming.price, 0) > 0),
           "manualPriceApproved" = CASE WHEN COALESCE(incoming.price, 0) > 0 THEN false ELSE product."manualPriceApproved" END,
           "manualApprovedPrice" = CASE WHEN COALESCE(incoming.price, 0) > 0 THEN NULL ELSE product."manualApprovedPrice" END,
           "updatedAt" = now()
      FROM (VALUES ${values}) AS incoming("externalId", price, stock)
     WHERE product."externalId" = incoming."externalId"
       AND product."isDeleted" = false
       AND ((incoming.price > 0 AND product.price IS DISTINCT FROM incoming.price)
         OR product.stock IS DISTINCT FROM incoming.stock
         OR product."erpPriceMissing" IS DISTINCT FROM NOT (COALESCE(incoming.price, 0) > 0)
         OR (COALESCE(incoming.price, 0) > 0 AND product."manualPriceApproved"))
  `
}

function buildParams(products: ErpProduct[]): unknown[] {
  return products.flatMap(product => [product.externalId, product.price, product.stock])
}

/** Updates exact, already-linked, non-deleted Products. It can never insert or link. */
export async function upsertProducts(
  db: ExtendedPrismaClient,
  products: ErpProduct[],
  _runId: string,
): Promise<number> {
  if (products.length === 0) return 0
  await db.$executeRawUnsafe(buildUpsertQuery(products.length), ...buildParams(products))
  return products.length
}
