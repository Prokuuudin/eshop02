import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { PGlite } from '@electric-sql/pglite'

vi.mock('server-only', () => ({}))
const db = vi.hoisted(() => ({
  product: { findMany: vi.fn(), count: vi.fn() },
  keyValueSetting: { findUnique: vi.fn() },
}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn().mockResolvedValue({ id: 'fixture-admin', platformRole: 'admin' }) }))

// Exercise the real GET handler/helper/mapping against isolated in-memory PostgreSQL SQL sorting.
// Only the Prisma boundary is mocked; no DATABASE_URL, network, application schema or migrations.
import { GET } from './route'

const tiedAt = new Date('2026-10-06T12:00:00.000Z')
const makeRow = (id: string, createdAt = tiedAt) => ({
  id, createdAt, title: 'Pagination fixture', brand: 'Fixture', price: 5,
  category: 'hair', stock: 25, isActive: true, isDeleted: false,
  externalId: null, erpPriceMissing: false, manualPriceApproved: false,
  manualApprovedPrice: null, oldPrice: null, images: [], badges: [],
  relatedProductIds: [], oftenBoughtTogether: [], certificates: [], compatibleEquipment: [],
})
const fixtures = [
  ...Array.from({ length: 205 }, (_, i) => makeRow(`fixture-${String(i).padStart(4, '0')}`)),
  makeRow('newer', new Date('2026-10-07T00:00:00Z')),
  makeRow('older', new Date('2026-10-05T00:00:00Z')),
]
let fixtureDb: PGlite
beforeAll(async () => {
  fixtureDb = new PGlite()
  await fixtureDb.exec('CREATE TABLE pagination_fixture (id text PRIMARY KEY, created_at timestamptz NOT NULL, payload jsonb NOT NULL)')
  await fixtureDb.query(`INSERT INTO pagination_fixture (id, created_at, payload)
    SELECT item->>'id', (item->>'createdAt')::timestamptz, item FROM jsonb_array_elements($1::jsonb) item`, [JSON.stringify(fixtures)])
}, 30000)
afterAll(async () => { await fixtureDb?.close() })

beforeEach(() => {
  vi.clearAllMocks()
  db.keyValueSetting.findUnique.mockResolvedValue(null)
  db.product.count.mockImplementation(async () => Number((await fixtureDb.query<{ count: number }>('SELECT count(*) AS count FROM pagination_fixture')).rows[0].count))
  db.product.findMany.mockImplementation(async ({ orderBy, skip, take }) => {
    const terms = Array.isArray(orderBy) ? orderBy : [orderBy]
    const ordering = terms.map(term => {
      const [key, direction] = Object.entries(term)[0]
      const column = key === 'createdAt' ? 'created_at' : key === 'id' ? 'id' : null
      if (!column || !['asc', 'desc'].includes(String(direction))) throw new Error('Unexpected fixture ordering')
      return `${column} ${String(direction).toUpperCase()}`
    }).join(', ')
    const result = await fixtureDb.query<{ payload: unknown }>(
      `SELECT payload FROM pagination_fixture ORDER BY ${ordering} LIMIT $1 OFFSET $2`, [take, skip])
    return result.rows.map(row => row.payload)
  })
})

async function page(number: number, limit = 100) {
  const response = await GET(new NextRequest(`https://fixture.invalid/api/admin/products?page=${number}&limit=${limit}`))
  expect(response.status).toBe(200)
  const body = await response.json()
  expect(body.success).toBe(true)
  return body.data as { products: Array<{ id: string }>; total: number; page: number; limit: number; hasMore: boolean }
}
const ids = (p: { products: Array<{ id: string }> }) => p.products.map(row => row.id)

describe('admin product pagination with 205 equal createdAt values', () => {
  it('has disjoint pages and covers all fixture records without loss', async () => {
    const first = await page(1), second = await page(2), third = await page(3)
    expect(ids(first).filter(id => ids(second).includes(id))).toEqual([])
    const combined = [...ids(first), ...ids(second), ...ids(third)]
    expect(new Set(combined).size).toBe(fixtures.length)
    expect([...combined].sort()).toEqual(fixtures.map(row => row.id).sort())
    expect(combined[0]).toBe('newer')
    expect(combined.at(-1)).toBe('older')
  })

  it('returns the same order on repeated requests and preserves metadata', async () => {
    const first = await page(1), second = await page(2)
    expect(ids(await page(1))).toEqual(ids(first))
    expect(ids(await page(2))).toEqual(ids(second))
    for (const [number, count, hasMore] of [[1, 100, true], [2, 100, true], [3, 7, false], [4, 0, false]] as const) {
      const result = await page(number)
      expect(result).toMatchObject({ total: 207, page: number, limit: 100, hasMore })
      expect(result.products).toHaveLength(count)
    }
    expect(first.products[1].id).toBe('fixture-0204')
  })

  it('retains the limit cap and offset contract', async () => {
    const result = await page(2, 999)
    expect(result).toMatchObject({ page: 2, limit: 100, total: 207, hasMore: true })
    expect(db.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 100, take: 100, where: { isDeleted: false },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    }))
  })
})
