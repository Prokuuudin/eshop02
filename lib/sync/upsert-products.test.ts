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

  it('invalidates open editors only when ERP-owned fields change', () => {
    const sql = buildUpsertQuery(1)
    expect(sql).toContain('"revision" = product."revision" + 1')
    expect(sql).toContain('product.price IS DISTINCT FROM incoming.price')
    expect(sql).toContain('product.stock IS DISTINCT FROM incoming.stock')
  })

  it('updates only ERP-owned price, stock and bookkeeping', () => {
    const sql = buildUpsertQuery(1)
    expect(sql).toContain('CASE WHEN incoming.price > 0')
    expect(sql).toContain('stock = incoming.stock')
    const setClause = sql.split('FROM (VALUES')[0]
    expect(setClause).not.toMatch(/"externalId"\s*=|\bsku\s*=|"isActive"\s*=/)
  })

  it('never writes Hairshop-Pro-owned promo fields (oldPrice, badges)', () => {
    const setClause = buildUpsertQuery(1).split('FROM (VALUES')[0]
    expect(setClause).not.toMatch(/"oldPrice"|\bbadges\b/)
  })

  it('sends price2 as the base price and keeps the price2=0 guard', async () => {
    const mock = db(2)
    await upsertProducts(mock, [
      { externalId: 'SDO3', title: 'SDO3', price: 7.5, stock: 4 },
      { externalId: 'BLK', title: 'BLK', price: 0, stock: 0 },
    ], 'run')
    const [sql, ...params] = (mock.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(params).toEqual(['SDO3', 7.5, 4, 'BLK', 0, 0])
    expect(sql).toContain('CASE WHEN incoming.price > 0 THEN incoming.price ELSE product.price END')
  })

  it('B: price2 <= 0 keeps the local price but marks the ERP B2B price as missing', () => {
    const setClause = buildUpsertQuery(1).split('FROM (VALUES')[0]
    expect(setClause).toContain('price = CASE WHEN incoming.price > 0 THEN incoming.price ELSE product.price END')
    expect(setClause).toContain('"erpPriceMissing" = NOT (COALESCE(incoming.price, 0) > 0)')
    expect(setClause).not.toMatch(/(^|[^.])price = 0/)
  })

  it('A/D: price2 > 0 writes price2, clears the flag and consumes any manual approval', () => {
    const setClause = buildUpsertQuery(1).split('FROM (VALUES')[0]
    expect(setClause).toContain('"manualPriceApproved" = CASE WHEN COALESCE(incoming.price, 0) > 0 THEN false ELSE product."manualPriceApproved" END')
    expect(setClause).toContain('"manualApprovedPrice" = CASE WHEN COALESCE(incoming.price, 0) > 0 THEN NULL ELSE product."manualApprovedPrice" END')
  })

  it('never grants a manual approval and updates rows whose flag state is out of date', () => {
    const sql = buildUpsertQuery(1)
    expect(sql).not.toMatch(/"manualPriceApproved" = true/)
    expect(sql).toContain('product."erpPriceMissing" IS DISTINCT FROM NOT (COALESCE(incoming.price, 0) > 0)')
    expect(sql).toContain('(COALESCE(incoming.price, 0) > 0 AND product."manualPriceApproved")')
  })

  it('skips empty batches and reports the exact linked rows processed', async () => {
    const mock = db(1)
    expect(await upsertProducts(mock, [], 'run')).toBe(0)
    expect(await upsertProducts(mock, [{ externalId: 'known', title: 'x', price: 0, stock: 0 }], 'run')).toBe(1)
    expect(mock.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })
})
