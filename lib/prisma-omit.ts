import type { Product as PrismaProduct } from '../generated/prisma/client'

/**
 * Columns the Prisma client never selects unless a query opts in with
 * `omit: { <field>: false }`.
 *
 * The retail (B2C) price columns come from an additive migration that is applied
 * separately from code deploys. Prisma selects every scalar column when a query has no
 * explicit `select`, so without this omit any such Product query fails on a database
 * where the migration has not been applied yet (P2022 ColumnNotFound). Omitting them
 * keeps every existing query identical to before the migration; the retail sync writes
 * them with raw SQL only, and only when GRINS_RETAIL_PRICE_SYNC_ENABLED=true.
 */
export const PRODUCT_RETAIL_COLUMNS_OMIT = {
  retailPrice: true,
  retailPriceMissing: true,
  retailPriceUpdatedAt: true,
  b2cBasePrice: true,
  b2cBasePriceSource: true,
  b2cBasePriceUpdatedAt: true,
} as const

export const PRISMA_GLOBAL_OMIT = { product: PRODUCT_RETAIL_COLUMNS_OMIT } as const

/** A Product row as the app's Prisma client returns it by default (retail columns omitted). */
export type StoredProduct = Omit<PrismaProduct, keyof typeof PRODUCT_RETAIL_COLUMNS_OMIT>
