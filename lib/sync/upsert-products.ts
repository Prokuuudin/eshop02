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

  return `
    UPDATE "Product" AS product
       SET price = CASE WHEN incoming.price > 0 THEN incoming.price ELSE product.price END,
           stock = incoming.stock,
           "updatedAt" = now()
      FROM (VALUES ${values}) AS incoming("externalId", price, stock)
     WHERE product."externalId" = incoming."externalId"
       AND product."isDeleted" = false
       AND ((incoming.price > 0 AND product.price IS DISTINCT FROM incoming.price)
         OR product.stock IS DISTINCT FROM incoming.stock)
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
