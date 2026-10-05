import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Order } from './orders-store'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: async () => ({ id: 'user' }) }))
const db = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn(), settings: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  product: { findMany: db.findMany, count: db.count },
  keyValueSetting: { findUnique: db.settings },
} }))
import { getCatalogFacets, getInitialCatalogProducts } from './initial-catalog-products'
import { getInvoiceProductTitlesByIds, type ProductOverride } from './product-overrides-store'
import { buildInvoiceHtml } from './invoice-template'

const base = { id: 'regression-product', title: 'Base name', titleEn: 'English needle', titleLv: 'Vietejais nosaukums',
  brand: 'Old Brand', price: 10, oldPrice: null, rating: 0, category: 'hair', stock: 5,
  createdAt: new Date(), isActive: true, isDeleted: false, externalId: null, erpPriceMissing: false,
  manualPriceApproved: false, manualApprovedPrice: null, badges: [], technicalSpecs: {}, image: '', bulkPricing: [] }
type Query = { where?: { isActive?: boolean; isDeleted?: boolean; category?: string; id?: { in: string[] }; brand?: { in: string[] }; OR?: Record<string, { contains: string }>[] }; select?: Record<string, boolean>; distinct?: string[]; skip?: number; take?: number }
let rows = [base]
let overrides: Record<string, ProductOverride> = {}
function matching(q: Query) {
  return rows.filter(row => {
    const w = q.where ?? {}
    if (w.isActive !== undefined && row.isActive !== w.isActive) return false
    if (w.isDeleted !== undefined && row.isDeleted !== w.isDeleted) return false
    if (w.category && row.category !== w.category) return false
    if (w.id && !w.id.in.includes(row.id)) return false
    if (w.brand && !w.brand.in.includes(row.brand)) return false
    return !w.OR || w.OR.some(clause => Object.entries(clause).some(([field, condition]) =>
      String(row[field as keyof typeof row] ?? '').toLowerCase().includes(condition.contains.toLowerCase())))
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  rows = [{ ...base }]
  overrides = {}
  db.settings.mockImplementation(async ({ where }: { where: { key: string } }) =>
    where.key === 'product-overrides' ? { value: overrides } : null)
  db.findMany.mockImplementation(async (q: Query) => {
    let result = matching(q)
    if (q.distinct) result = result.filter((row, index, all) => all.findIndex(other => other.brand === row.brand) === index)
    result = result.slice(q.skip ?? 0, q.take === undefined ? undefined : (q.skip ?? 0) + q.take)
    return result.map(row => q.select ? Object.fromEntries(Object.keys(q.select).map(key => [key, row[key as keyof typeof row]])) : row)
  })
  db.count.mockImplementation(async (q: Query) => matching(q).length)
})

describe('effective catalog filters', () => {
  it('finds the override brand shown by facets and excludes the old DB brand', async () => {
    overrides = { [base.id]: { brand: 'New Brand' } }
    const facets = await getCatalogFacets({ language: 'lv' })
    expect(facets.availableBrands).toContain('new-brand')
    const result = await getInitialCatalogProducts({ language: 'lv', brands: ['new-brand'] })
    expect(result.products.map(p => p.id)).toEqual([base.id])
    expect(result.totalProducts).toBe(1)
    expect((await getInitialCatalogProducts({ language: 'lv', brands: ['old-brand'] })).totalProducts).toBe(0)
  })
  it.each([false, true])('excludes another locale title consistently, with overrides=%s', async changed => {
    if (changed) overrides = { [base.id]: { titleLv: 'Cits vietejais nosaukums' } }
    const filters = { language: 'lv' as const, search: 'English needle' }
    const facets = await getCatalogFacets(filters)
    expect(facets.groupCounts['']).toBe(0)
    expect((await getInitialCatalogProducts(filters)).totalProducts).toBe(0)
  })
  it.each(['lv', 'en', 'ru'] as const)('agrees on current/base/brand search for %s', async language => {
    for (const search of [language === 'lv' ? 'Vietejais' : language === 'en' ? 'English' : 'Base', 'Base', 'Old Brand']) {
      expect((await getInitialCatalogProducts({ language, search })).totalProducts).toBe(1)
      expect((await getCatalogFacets({ language, search })).groupCounts['']).toBe(1)
    }
  })
  it('keeps normal brand/category filtering and excludes inactive/deleted products', async () => {
    rows.push({ ...base, id: 'inactive', isActive: false }, { ...base, id: 'deleted', isDeleted: true })
    expect((await getInitialCatalogProducts({ language: 'lv', brands: ['old-brand'], category: 'hair' })).products.map(p => p.id)).toEqual([base.id])
    expect((await getInitialCatalogProducts({ language: 'lv', category: 'nails' })).totalProducts).toBe(0)
    expect((await getInitialCatalogProducts({ language: 'lv', subcategories: ['nonexistent'] })).totalProducts).toBe(0)
    expect(db.findMany.mock.calls.every(([q]) => !!(q as Query).select)).toBe(true)
  })
})

describe('invoice translation batches', () => {
  it.each([100, 101, 200, 500])('enriches every one of %s lines without changing money or quantities', async count => {
    rows = Array.from({ length: count }, (_, index) => ({ ...base, id: `invoice-${index}`, titleLv: `Translated ${index}` }))
    overrides = { [`invoice-${count - 1}`]: { titleLv: 'Last translated override' } }
    const ids = rows.map(row => row.id)
    const titles = await getInvoiceProductTitlesByIds([...ids, ids[0], ' ', ` ${ids[0]} `])
    expect(titles).toHaveLength(count)
    expect(titles.at(-1)?.titleLv).toBe('Last translated override')
    expect(db.findMany).toHaveBeenCalledTimes(Math.ceil(count / 100))
    for (const [q] of db.findMany.mock.calls as [Query][]) {
      expect(q.where?.id?.in.length).toBeLessThanOrEqual(100)
      expect(q.where).toMatchObject({ isActive: true, isDeleted: false })
      expect(q.select).toEqual({ id: true, titleEn: true, titleLv: true })
    }
    const order: Order = { id: 'regression-order', items: ids.map(id => ({ id, lineKey: id, title: `Snapshot ${id}`, sku: id, brand: 'Brand', price: 10, quantity: 2 })),
      firstName: 'Test', lastName: 'Buyer', email: 'test@example.com', phone: '', address: '', city: '', postalCode: '',
      subtotal: count * 20, discount: 0, tax: 0, delivery: 0, total: count * 20, createdAt: new Date('2026-10-05T00:00:00Z'), status: 'pending', deliveryMethod: 'courier', paymentMethod: 'card' }
    const snapshot = structuredClone(order)
    const html = buildInvoiceHtml(order, Object.fromEntries(titles.map(row => [row.id, row.titleLv ?? ''])))
    expect(html).toContain('Last translated override')
    expect(html.match(/<td>2<\/td>/g)).toHaveLength(count)
    expect(html.match(/<td>20\.00 €<\/td>/g)).toHaveLength(count)
    for (const id of ids) expect(html).toContain(`<td>${id}</td>`)
    expect(html).toContain(`${(count * 20).toFixed(2)} €`)
    expect(order).toEqual(snapshot)
  })
  it('retains snapshot fallback for unavailable translations and avoids empty queries', async () => {
    expect(await getInvoiceProductTitlesByIds([' '])).toEqual([])
    expect(db.findMany).not.toHaveBeenCalled()
    rows = [{ ...base, titleLv: '' }]
    const titles = await getInvoiceProductTitlesByIds([base.id, 'missing'])
    expect(titles).toHaveLength(1)
    expect(titles[0].titleLv).toBe('')
  })
})
