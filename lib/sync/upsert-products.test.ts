import { upsertProducts, buildUpsertQuery, COLS_PER_ROW } from './upsert-products'
import type { ExtendedPrismaClient } from '@/lib/prisma'

function makeMockDb(): ExtendedPrismaClient {
  return {
    $executeRawUnsafe: vi.fn().mockResolvedValue(2),
  } as unknown as ExtendedPrismaClient
}

describe('buildUpsertQuery', () => {
  it('generates the correct last positional param for N rows', () => {
    const sql = buildUpsertQuery(3)
    expect(sql).toContain(`$${3 * COLS_PER_ROW}`)
  })

  it('contains ON CONFLICT on externalId', () => {
    expect(buildUpsertQuery(1)).toContain('ON CONFLICT ("externalId")')
  })

  it('DO UPDATE SET includes ERP-owned fields', () => {
    const updatePart = buildUpsertQuery(1).split('DO UPDATE SET')[1]
    expect(updatePart).toContain('"lastSyncRunId"')
    expect(updatePart).toContain('"isActive"')
    expect(updatePart).toContain('price')
    expect(updatePart).toContain('stock')
  })

  it('DO UPDATE SET does not include id or createdAt', () => {
    const updatePart = buildUpsertQuery(1).split('DO UPDATE SET')[1]
    expect(updatePart).not.toMatch(/\bid\b\s*=/)
    expect(updatePart).not.toContain('"createdAt"')
  })

  it('DO UPDATE SET does not overwrite admin-owned fields (title/brand/category/description/images)', () => {
    const updatePart = buildUpsertQuery(1).split('DO UPDATE SET')[1]
    expect(updatePart).not.toMatch(/\btitle\b\s*=/)
    expect(updatePart).not.toMatch(/\bbrand\b\s*=/)
    expect(updatePart).not.toMatch(/\bcategory\b\s*=/)
    expect(updatePart).not.toMatch(/\bdescription\b\s*=/)
    expect(updatePart).not.toMatch(/\bimages\b\s*=/)
  })
})

describe('upsertProducts', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 0 and skips the query for empty input', async () => {
    const db = makeMockDb()
    const count = await upsertProducts(db, [], 'run-1')
    expect(count).toBe(0)
    expect(db.$executeRawUnsafe).not.toHaveBeenCalled()
  })

  it('returns count of products and calls $executeRawUnsafe once', async () => {
    const db = makeMockDb()
    const products = [
      { externalId: 'ext-1', title: 'Prod A', price: 100, stock: 10 },
      { externalId: 'ext-2', title: 'Prod B', price: 200, stock: 5 },
    ]
    const count = await upsertProducts(db, products, 'run-1')
    expect(count).toBe(2)
    expect(db.$executeRawUnsafe).toHaveBeenCalledTimes(1)
  })

  it('includes the runId in query params', async () => {
    const db = makeMockDb()
    await upsertProducts(db, [{ externalId: 'e1', title: 'P', price: 10, stock: 1 }], 'my-run-id')
    const args = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(args).toContain('my-run-id')
  })

  it('inserts new rows as isActive=false (pending review), regardless of feed value', async () => {
    const db = makeMockDb()
    await upsertProducts(db, [{ externalId: 'e1', title: 'placeholder', price: 10, stock: 1 }], 'run-1')
    const args = (db.$executeRawUnsafe as ReturnType<typeof vi.fn>).mock.calls[0]
    // args[0] is the SQL string; params start at args[1]. isActive is column
    // index 11 (0-based) of the 14 COLS_PER_ROW, so its param is args[1 + 11].
    expect(args[1 + 11]).toBe(false)
  })
})
