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
vi.mock('@/lib/product-overrides-store', () => ({ mapDbToProduct: (row: Product) => row }))
vi.mock('@/lib/promo-campaigns', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/lib/promo-campaigns')>(),
  readPromoCampaigns: vi.fn(async () => []),
}))

import { getCachedSaleProducts } from '@/lib/storefront-cache'
import { readPromoCampaigns } from '@/lib/promo-campaigns'

const product = (id: string, extra: Partial<Product> = {}): Product => ({
  id, title: id, brand: 'Brand', category: 'hair', price: 10,
  stock: 0, badges: [], ...extra,
} as Product)

describe('homepage sale products', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(readPromoCampaigns).mockResolvedValue([]) })

  it('returns every reduced-price product beyond 24, including products without images or stock', async () => {
    const rows = Array.from({ length: 65 }, (_, i) => product(`sale-${i}`, { oldPrice: 20 }))
    findMany.mockResolvedValue(rows)
    expect(await getCachedSaleProducts()).toHaveLength(65)
    const query = findMany.mock.calls[0][0]
    expect(query).not.toHaveProperty('take')
    expect(query.where).not.toHaveProperty('image')
    expect(query.where).not.toHaveProperty('stock')
    expect(query.where).toMatchObject({ isActive: true, isDeleted: false })
    expect(query.where.AND[1].OR).toContainEqual({ oldPrice: { gt: 'price-field' } })
  })

  it('includes sale badges and valid reductions while excluding regular prices and invalid B2B prices', async () => {
    findMany.mockResolvedValue([
      product('badge', { badges: ['sale'] }), product('reduced', { oldPrice: 15 }),
      product('regular'), product('equal', { oldPrice: 10 }), product('higher', { oldPrice: 5 }),
      product('unavailable', { oldPrice: 20, priceUnavailable: true }),
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
})
