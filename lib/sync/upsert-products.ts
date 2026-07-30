import { randomUUID } from 'crypto'
import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { ErpProduct } from './erp-adapter'

// Columns per product row in the INSERT statement.
// Order must match buildParams exactly.
export const COLS_PER_ROW = 14

export function buildUpsertQuery(rowCount: number): string {
  const values = Array.from({ length: rowCount }, (_, i) => {
    const base = i * COLS_PER_ROW
    const params = Array.from({ length: COLS_PER_ROW }, (_, j) => `$${base + j + 1}`)
    return `(${params.join(',')})`
  }).join(',')

  return `
    INSERT INTO "Product" (
      id, "externalId", title, brand, category,
      price, "oldPrice", stock, sku, images,
      description, "isActive", "lastSyncRunId", "updatedAt"
    ) VALUES ${values}
    ON CONFLICT ("externalId") DO UPDATE SET
      -- title/brand/category/description/images are admin-owned forever for synced
      -- products: the feed doesn't send brand/category/image/description at all, and
      -- title is deliberately seeded from SKU only (see grins-xml-parser.ts), so
      -- overwriting them here on every run would blank out real admin-entered data.
      price           = EXCLUDED.price,
      "oldPrice"      = EXCLUDED."oldPrice",
      stock           = EXCLUDED.stock,
      sku             = EXCLUDED.sku,
      "isActive"      = true,
      "lastSyncRunId" = EXCLUDED."lastSyncRunId",
      "updatedAt"     = now()
  `
}

function buildParams(products: ErpProduct[], runId: string): unknown[] {
  return products.flatMap(p => [
    randomUUID(),           // id (new UUID for new rows; ignored on conflict)
    p.externalId,           // externalId
    p.title,                // title
    p.brand ?? '',          // brand
    p.category ?? 'uncategorized', // category
    p.price,                // price
    p.oldPrice ?? null,     // oldPrice
    p.stock,                // stock
    p.sku ?? null,          // sku
    p.images ?? null,       // images (TEXT[], nullable)
    p.description ?? null,  // description
    // Brand-new rows start hidden (pending review, spec section 10 — the feed has no
    // machine-readable flag for non-product junk rows). Already-known rows are
    // unaffected: ON CONFLICT DO UPDATE forces isActive back to true unconditionally.
    false,                  // isActive
    runId,                  // lastSyncRunId
    new Date(),             // updatedAt (createdAt uses DB DEFAULT for new rows)
  ])
}

export async function upsertProducts(
  db: ExtendedPrismaClient,
  products: ErpProduct[],
  runId: string,
): Promise<number> {
  if (products.length === 0) return 0
  const sql = buildUpsertQuery(products.length)
  const params = buildParams(products, runId)
  await db.$executeRawUnsafe(sql, ...params)
  return products.length
}
