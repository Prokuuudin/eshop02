import { upsertProducts, buildUpsertQuery, COLS_PER_ROW } from './upsert-products'
import type { ExtendedPrismaClient } from '@/lib/prisma'

const db = (affected = 1) => ({ $executeRawUnsafe: vi.fn().mockResolvedValue(affected) }) as unknown as ExtendedPrismaClient

describe('safe linked-product update SQL', () => {
  it('uses a parameterized UPDATE and has no INSERT/conflict path', () => {
    const sql = buildUpsertQuery(3)
    expect(sql).toContain(`$${3 * COLS_PER_ROW}`)
    expect(sql).toMatch(/UPDATE "Product"/)
    expect(sql).not.toMatch(/\bINSERT\b|ON CONFLICT/i)
  })

  it('matches only exact externalId and excludes soft-deleted Products', () => {
    const sql = buildUpsertQuery(1)
    expect(sql).toContain('product."externalId" = incoming."externalId"')
    expect(sql).toContain('product."isDeleted" = false')
  })

  it('updates only ERP-owned price, stock and bookkeeping', () => {
    const sql = buildUpsertQuery(1)
    expect(sql).toContain('CASE WHEN incoming.price > 0')
    expect(sql).toContain('stock = incoming.stock')
    const setClause = sql.split('FROM (VALUES')[0]
    expect(setClause).not.toMatch(/"externalId"\s*=|\bsku\s*=|"isActive"\s*=/)
  })

  it('skips empty batches and reports the exact linked rows processed', async () => {
    const mock = db(1)
    expect(await upsertProducts(mock, [], 'run')).toBe(0)
    expect(await upsertProducts(mock, [{ externalId: 'known', title: 'x', price: 0, stock: 0 }], 'run')).toBe(1)
    expect(mock.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })
})
