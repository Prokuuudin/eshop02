import { randomUUID } from 'crypto'
import type { PrismaClient } from '@/generated/prisma/client'
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
      title           = EXCLUDED.title,
      brand           = EXCLUDED.brand,
      category        = EXCLUDED.category,
      price           = EXCLUDED.price,
      "oldPrice"      = EXCLUDED."oldPrice",
      stock           = EXCLUDED.stock,
      sku             = EXCLUDED.sku,
      images          = EXCLUDED.images,
      description     = EXCLUDED.description,
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
    true,                   // isActive
    runId,                  // lastSyncRunId
    new Date(),             // updatedAt (createdAt uses DB DEFAULT for new rows)
  ])
}

export async function upsertProducts(
  db: PrismaClient,
  products: ErpProduct[],
  runId: string,
): Promise<number> {
  if (products.length === 0) return 0
  const sql = buildUpsertQuery(products.length)
  const params = buildParams(products, runId)
  await db.$executeRawUnsafe(sql, ...params)
  return products.length
}
