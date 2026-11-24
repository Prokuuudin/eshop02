import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('./retry', () => ({ withRetry: vi.fn().mockImplementation((fn: () => Promise<unknown>) => fn()) }))
vi.mock('./upsert-products', () => ({ upsertProducts: vi.fn().mockResolvedValue(2) }))
vi.mock('./erp-extra-data-store', () => ({
  getErpExtraData: vi.fn().mockResolvedValue({}),
  mergeEnabledPriceTiers: vi.fn((_current, incoming) => incoming),
  replaceErpExtraData: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('./retail-price', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./retail-price')>()),
  applyRetailPrices: vi.fn().mockResolvedValue(1),
}))

import { runSync } from './sync-runner'
import { upsertProducts } from './upsert-products'
import { applyRetailPrices } from './retail-price'
import type { ErpAdapter } from './erp-adapter'
import type { ExtendedPrismaClient } from '@/lib/prisma'

function makeDb(): ExtendedPrismaClient {
  const db = {
    syncRun: {
      create: vi.fn().mockResolvedValue({ id: 'run-1' }),
      update: vi.fn().mockResolvedValue({}),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      findFirst: vi.fn().mockResolvedValue(null),
    },
    product: {
      findMany: vi.fn().mockImplementation(({ where }) => Promise.resolve(
        (where.externalId.in as string[]).map((externalId) => ({ externalId, isDeleted: false })),
      )),
    },
    // Retail columns present (migrated DB) unless a test overrides it.
    $queryRawUnsafe: vi.fn().mockImplementation(async (sql: string) =>
      (sql.includes('information_schema.columns') ? [{ count: 3 }] : [{ key: 'sync-run-lock' }])),
    $executeRawUnsafe: vi.fn().mockResolvedValue(1),
  }
  ;(db as typeof db & { $transaction: unknown }).$transaction = vi.fn(async (operation: (tx: unknown) => unknown) => operation(db))
  return db as unknown as ExtendedPrismaClient
}

const products = [
  { externalId: 'A', title: 'A', price: 7, stock: 3, prices: { price1: 9.5, price2: 7, price3: 3, price4: 0 } },
  { externalId: 'B', title: 'B', price: 8, stock: 1, prices: { price1: 0, price2: 8, price3: 0, price4: 0 } },
]
const adapter = (): ErpAdapter => ({ name: 'test', fetchPage: vi.fn().mockResolvedValue({ products, hasMore: false }) })

describe('FULL sync retail step', () => {
  beforeEach(() => vi.clearAllMocks())
  afterEach(() => vi.unstubAllEnvs())

  it('is not run by default; the B2B upsert receives exactly the same products', async () => {
    const result = await runSync(adapter(), makeDb())
    expect(result.status).toBe('completed')
    expect(applyRetailPrices).not.toHaveBeenCalled()
    expect(vi.mocked(upsertProducts).mock.calls[0][1]).toEqual(products)
  })

  it('writes price1 after the B2B upsert in the same transaction when enabled', async () => {
    vi.stubEnv('GRINS_RETAIL_PRICE_SYNC_ENABLED', 'true')
    const db = makeDb()
    const result = await runSync(adapter(), db)
    expect(result.status).toBe('completed')
    expect(vi.mocked(upsertProducts).mock.calls[0][1]).toEqual(products)
    expect(applyRetailPrices).toHaveBeenCalledWith(db, [
      { externalId: 'A', retailPrice: '9.50' },
      { externalId: 'B', retailPrice: null },
    ])
    expect(vi.mocked(upsertProducts).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(applyRetailPrices).mock.invocationCallOrder[0])
  })

  it('stays off when price1 is excluded by SYNC_ENABLED_PRICE_TIERS', async () => {
    vi.stubEnv('GRINS_RETAIL_PRICE_SYNC_ENABLED', 'true')
    vi.stubEnv('SYNC_ENABLED_PRICE_TIERS', 'price2')
    await runSync(adapter(), makeDb())
    expect(applyRetailPrices).not.toHaveBeenCalled()
  })

  it('flag on before the migration: retail step skipped, B2B sync completes', async () => {
    vi.stubEnv('GRINS_RETAIL_PRICE_SYNC_ENABLED', 'true')
    const db = makeDb()
    vi.mocked(db.$queryRawUnsafe).mockImplementation((async (sql: string) =>
      (sql.includes('information_schema.columns') ? [{ count: 0 }] : [{ key: 'sync-run-lock' }])) as never)
    const result = await runSync(adapter(), db)
    expect(result.status).toBe('completed')
    expect(applyRetailPrices).not.toHaveBeenCalled()
    expect(upsertProducts).toHaveBeenCalledOnce()
  })

  it('a misspelt flag never breaks the B2B sync', async () => {
    vi.stubEnv('GRINS_RETAIL_PRICE_SYNC_ENABLED', 'yes please')
    const result = await runSync(adapter(), makeDb())
    expect(result.status).toBe('completed')
    expect(applyRetailPrices).not.toHaveBeenCalled()
    expect(upsertProducts).toHaveBeenCalledOnce()
  })
})
