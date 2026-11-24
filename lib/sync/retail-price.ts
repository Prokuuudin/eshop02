import type { ExtendedPrismaClient } from '@/lib/prisma'
import type { ErpProduct } from './erp-adapter'
import { manualDecimal } from './manual-import-validation'

/**
 * GrinS price1 → Product.retailPrice (reference retail price, ERP-owned).
 *
 * Independent of B2B pricing by construction: a separate UPDATE that sets only the three
 * retail columns. It never touches price, stock, erpPriceMissing, manual approval,
 * revision, updatedAt or b2cBasePrice, and B2B pricing/checkout never reads it.
 * price1 is treated as VAT-inclusive as delivered (working hypothesis, see PR notes):
 * no VAT is added here.
 */

export const RETAIL_PRICE_SYNC_FLAG = 'GRINS_RETAIL_PRICE_SYNC_ENABLED'

/**
 * Off unless explicitly "true". Any other value (typo included) means off rather than an
 * error: a retail misconfiguration must never stop the B2B price/stock sync.
 */
export function isRetailPriceSyncEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[RETAIL_PRICE_SYNC_FLAG]?.trim() === 'true'
}

const RETAIL_COLUMNS = ['retailPrice', 'retailPriceMissing', 'retailPriceUpdatedAt'] as const

/**
 * Whether this run writes price1: the flag is "true" AND the migration's columns exist.
 * Enabling the flag before the migration therefore skips the retail step instead of
 * failing the B2B import transaction it runs in.
 */
export async function isRetailPriceSyncActive(
  db: Pick<ExtendedPrismaClient, '$queryRawUnsafe'>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<boolean> {
  if (!isRetailPriceSyncEnabled(env)) return false
  const rows = await db.$queryRawUnsafe<Array<{ count: number }>>(
    `SELECT count(*)::int AS count FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = 'Product' AND column_name = ANY($1::text[])`,
    [...RETAIL_COLUMNS],
  )
  return Number(rows[0]?.count) === RETAIL_COLUMNS.length
}

/**
 * Valid positive price1 as a 2-decimal string, or null for "missing" (absent, zero,
 * negative, non-decimal, out of Product bounds). Same strict decimal rules as prices-only.
 */
export function normalizeRetailPrice(value: unknown): string | null {
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  const parsed = manualDecimal(value)
  return parsed !== null && parsed > 0 ? parsed.toFixed(2) : null
}

export type RetailPriceRow = { externalId: string; retailPrice: string | null }

/** FULL sync rows: only products whose feed actually carried price1. */
export function retailRowsFromErpProducts(products: readonly ErpProduct[]): RetailPriceRow[] {
  return products
    .filter((product) => product.externalId && product.prices !== undefined)
    .map((product) => ({ externalId: product.externalId, retailPrice: normalizeRetailPrice(product.prices?.price1) }))
}

const RETAIL_BATCH_SIZE = 500

/** Retail-only UPDATE. Unchanged rows are not written (no timestamp churn). */
export function buildRetailPriceQuery(count: number): string {
  const values = Array.from({ length: count }, (_, index) => `($${index * 2 + 1}::text,round($${index * 2 + 2}::numeric,2))`).join(',')
  return `UPDATE "Product" p SET
    "retailPrice"=CASE WHEN v.retail>0 THEN v.retail ELSE p."retailPrice" END,
    "retailPriceMissing"=NOT COALESCE(v.retail>0,false),
    "retailPriceUpdatedAt"=now()
    FROM (VALUES ${values}) v("externalId",retail)
    WHERE p."externalId"=v."externalId" AND NOT p."isDeleted"
      AND ((v.retail>0 AND p."retailPrice" IS DISTINCT FROM v.retail)
        OR p."retailPriceMissing" IS DISTINCT FROM NOT COALESCE(v.retail>0,false))`
}

type RawDb = Pick<ExtendedPrismaClient, '$executeRawUnsafe' | '$queryRawUnsafe'>

export async function applyRetailPrices(db: RawDb, rows: readonly RetailPriceRow[]): Promise<number> {
  let affected = 0
  for (let index = 0; index < rows.length; index += RETAIL_BATCH_SIZE) {
    const batch = rows.slice(index, index + RETAIL_BATCH_SIZE)
    affected += await db.$executeRawUnsafe(buildRetailPriceQuery(batch.length), ...batch.flatMap((row) => [row.externalId, row.retailPrice]))
  }
  return affected
}

/** Pre-import state of the retail columns, kept in the prices-only backup for restore. */
export type RetailSnapshotRow = { id: string; retailPrice: string | null; retailPriceMissing: boolean; retailPriceUpdatedAt: string | null }

const retailSignature = (row: RetailSnapshotRow) => JSON.stringify([row.id, row.retailPrice, row.retailPriceMissing, row.retailPriceUpdatedAt])

export async function snapshotRetailPrices(db: RawDb): Promise<RetailSnapshotRow[]> {
  // ::text keeps the stored timestamp(3) value exact (no driver time-zone shift).
  return db.$queryRawUnsafe<RetailSnapshotRow[]>(
    `SELECT id, "retailPrice"::text AS "retailPrice", "retailPriceMissing", "retailPriceUpdatedAt"::text AS "retailPriceUpdatedAt"
       FROM "Product" WHERE "externalId" IS NOT NULL AND NOT "isDeleted" ORDER BY id`,
  )
}

/** Backup rows whose retail columns differ from the current database state. */
export async function diffRetailPrices(db: RawDb, backup: readonly RetailSnapshotRow[]): Promise<RetailSnapshotRow[]> {
  const current = new Map((await snapshotRetailPrices(db)).map((row) => [row.id, retailSignature(row)]))
  return backup.filter((row) => current.has(row.id) && current.get(row.id) !== retailSignature(row))
}

/** Writes the given backup rows' retail columns back. Returns rows written. */
export async function restoreRetailPrices(db: RawDb, differing: readonly RetailSnapshotRow[]): Promise<number> {
  let restored = 0
  for (let index = 0; index < differing.length; index += RETAIL_BATCH_SIZE) {
    const batch = differing.slice(index, index + RETAIL_BATCH_SIZE)
    const values = batch.map((_, row) => {
      const offset = row * 4
      return `($${offset + 1}::text,$${offset + 2}::numeric,$${offset + 3}::boolean,$${offset + 4}::timestamp(3))`
    }).join(',')
    restored += await db.$executeRawUnsafe(
      `UPDATE "Product" p SET "retailPrice"=v.rp, "retailPriceMissing"=v.rpm, "retailPriceUpdatedAt"=v.rpu
        FROM (VALUES ${values}) v(id,rp,rpm,rpu) WHERE p.id=v.id`,
      ...batch.flatMap((row) => [row.id, row.retailPrice, row.retailPriceMissing, row.retailPriceUpdatedAt]),
    )
  }
  return restored
}
