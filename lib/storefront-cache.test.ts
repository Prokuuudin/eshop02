import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@/data/products'

const { findMany } = vi.hoisted(() => ({ findMany: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany, fields: { price: 'price-field' } } } }))
vi.mock('@/lib/categories-server-store', () => ({ getCategoriesConfigFromStore: vi.fn() }))
vi.mock('@/lib/brands-server-store', () => ({ getBrandsConfigFromStore: vi.fn() }))
vi.mock('@/lib/banners-server-store', () => ({ readBannersData: vi.fn() }))
vi.mock('@/lib/locale-config-server-store', () => ({ getLocaleConfig: vi.fn() }))
vi.mock('@/lib/bonus-config-server-store', () => ({ getBonusProgramConfig: vi.fn() }))
vi.mock('@/lib/product-overrides-store', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/product-overrides-store')>(),
  getProductOverrides: vi.fn(async () => ({})),
}))
vi.mock('@/lib/promo-campaigns', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/promo-campaigns')>(),
  readPromoCampaigns: vi.fn(async () => []),
}))

import { getCachedSaleProducts } from '@/lib/storefront-cache'
import { readPromoCampaigns } from '@/lib/promo-campaigns'
import { getProductOverrides } from '@/lib/product-overrides-store'

const product = (id: string, extra: Partial<Product> = {}): Product => ({
  id, title: id, brand: 'Brand', category: 'hair', price: 10,
  stock: 10, badges: [], ...extra,
} as Product)

describe('homepage sale products', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readPromoCampaigns).mockResolvedValue([])
    vi.mocked(getProductOverrides).mockResolvedValue({})
  })

  it('returns every in-stock reduced-price product beyond 24, including products without images', async () => {
    const rows = Array.from({ length: 65 }, (_, i) => product(`sale-${i}`, { oldPrice: 20 }))
    findMany.mockResolvedValue(rows)
    expect(await getCachedSaleProducts()).toHaveLength(65)
    const query = findMany.mock.calls[0][0]
    expect(query).not.toHaveProperty('take')
    expect(query.where).not.toHaveProperty('image')
    expect(query.where).not.toHaveProperty('stock')
    expect(query.where).toMatchObject({ isActive: true, isDeleted: false })
    expect(query.where).not.toHaveProperty('AND')
    expect(query.select).toMatchObject({ price: true, oldPrice: true, stock: true })
  })

  it('includes sale badges and valid reductions while excluding regular prices and invalid B2B prices', async () => {
    findMany.mockResolvedValue([
      product('badge', { badges: ['sale'] }), product('reduced', { oldPrice: 15 }),
      product('regular'), product('equal', { oldPrice: 10 }), product('higher', { oldPrice: 5 }),
      product('unavailable', { oldPrice: 20, erpPriceMissing: true, externalId: 'erp' } as Partial<Product>),
    ])
    expect((await getCachedSaleProducts()).map((p) => p.id)).toEqual(['badge', 'reduced'])
  })

  it('includes campaign products with normalized brands and excludes nonmatching campaign candidates', async () => {
    vi.mocked(readPromoCampaigns).mockResolvedValue([{
      id: 'campaign', name: 'Sale', description: '', type: 'discount', discountPercent: 20,
      active: true, startDate: '2020-01-01', endDate: '', targetCategories: [],
      targetSubcategories: [], targetBrands: ['My Brand'], minOrderAmount: 0,
      createdAt: '', updatedAt: '',
    }])
    findMany.mockResolvedValue([product('match', { brand: ' MY  BRAND ' }), product('other')])
    expect((await getCachedSaleProducts()).map((p) => p.id)).toEqual(['match'])
  })

  it('excludes zero and negative stock for badges, reduced prices and campaign offers', async () => {
    findMany.mockResolvedValue([
      product('zero', { stock: 0, oldPrice: 20 }),
      product('negative', { stock: -1, badges: ['sale'] }),
      product('available', { stock: 1, oldPrice: 20 }),
    ])
    expect((await getCachedSaleProducts()).map((p) => p.id)).toEqual(['available'])
  })

  it('uses effective admin prices and stock before deciding eligibility', async () => {
    findMany.mockResolvedValue([
      product('added'), product('removed', { oldPrice: 20 }),
      product('stock-removed', { oldPrice: 20 }), product('stock-added', { oldPrice: 20, stock: 0 }),
    ])
    vi.mocked(getProductOverrides).mockResolvedValue({
      added: { oldPrice: 20 }, removed: { oldPrice: 5 },
      'stock-removed': { stock: 0 }, 'stock-added': { stock: 2 },
    })
    expect((await getCachedSaleProducts()).map((p) => p.id)).toEqual(['added', 'stock-added'])
  })

  it('matches campaigns against the effective category and brand', async () => {
    vi.mocked(readPromoCampaigns).mockResolvedValue([{
      id: 'campaign', name: 'Sale', description: '', type: 'discount', discountPercent: 20,
      active: true, startDate: '2020-01-01', endDate: '', targetCategories: ['hair'],
      targetSubcategories: [], targetBrands: ['New Brand'], minOrderAmount: 0,
      createdAt: '', updatedAt: '',
    }])
    findMany.mockResolvedValue([product('changed'), product('out-of-stock', { stock: 0 })])
    vi.mocked(getProductOverrides).mockResolvedValue({
      changed: { brand: 'New Brand' }, 'out-of-stock': { brand: 'New Brand' },
    })
    expect((await getCachedSaleProducts()).map((p) => p.id)).toEqual(['changed'])
  })
})
