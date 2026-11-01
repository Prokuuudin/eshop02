import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Product } from '@/data/products'
import type { PromoCampaign } from '@/lib/promo-campaigns'

const { findMany, queryRaw, cacheStore } = vi.hoisted(() => ({
  findMany: vi.fn(), queryRaw: vi.fn(), cacheStore: new Map<string, unknown>(),
}))
vi.mock('server-only', () => ({}))
// Never-expiring cache keyed like unstable_cache (key parts + arguments): models an entry
// whose time-based revalidation does not run before a campaign starts or ends.
vi.mock('next/cache', () => ({
  unstable_cache: <A extends unknown[], R>(fn: (...args: A) => Promise<R>, keyParts: string[]) =>
    async (...args: A): Promise<R> => {
      const key = JSON.stringify([keyParts, args])
      if (!cacheStore.has(key)) cacheStore.set(key, await fn(...args))
      return cacheStore.get(key) as R
    },
}))
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany, fields: { price: 'price-field' } }, $queryRaw: queryRaw } }))
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

import { getCachedBestsellers, getCachedSaleProducts } from '@/lib/storefront-cache'
import { readPromoCampaigns } from '@/lib/promo-campaigns'

const product = (id: string, brand: string): Product => ({
  id, title: id, brand, category: 'hair', price: 10, stock: 10, badges: [],
} as unknown as Product)
const campaign = (id: string, brand: string, startDate: string, endDate: string): PromoCampaign => ({
  id, name: id, description: '', type: 'discount', discountPercent: 25, active: true, startDate, endDate,
  targetCategories: [], targetSubcategories: [], targetBrands: [brand], minOrderAmount: 0, createdAt: '', updatedAt: '',
})
const offerIds = (products: Product[]) => products.map((p) => [p.id, p.campaignOffers?.map((offer) => offer.id) ?? []])

describe('storefront campaign products follow campaign dates through a stale cache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cacheStore.clear()
    vi.useFakeTimers()
  })
  afterEach(() => vi.useRealTimers())

  it('shows a scheduled campaign from 00:00 of its start day', async () => {
    vi.mocked(readPromoCampaigns).mockResolvedValue([campaign('nov', 'SILCARE', '2026-11-01', '2026-11-30')])
    findMany.mockResolvedValue([product('1', 'SILCARE')])

    vi.setSystemTime(new Date(2026, 9, 31, 23, 59))
    expect(await getCachedSaleProducts()).toEqual([])
    vi.setSystemTime(new Date(2026, 10, 1, 0, 0, 1))
    expect(offerIds(await getCachedSaleProducts())).toEqual([['1', ['nov']]])
  })

  it('drops an ended campaign after its end day', async () => {
    vi.mocked(readPromoCampaigns).mockResolvedValue([campaign('oct', 'DANNY WONKER', '2026-10-06', '2026-10-31')])
    findMany.mockResolvedValue([product('1', 'DANNY WONKER')])

    vi.setSystemTime(new Date(2026, 9, 31, 23, 59))
    expect(offerIds(await getCachedSaleProducts())).toEqual([['1', ['oct']]])
    vi.setSystemTime(new Date(2026, 10, 1, 0, 0, 1))
    expect(await getCachedSaleProducts()).toEqual([])
  })

  it('updates campaign offers on bestseller cards', async () => {
    vi.mocked(readPromoCampaigns).mockResolvedValue([campaign('oct', 'DANNY WONKER', '2026-10-06', '2026-10-31')])
    queryRaw.mockResolvedValue([{ product_id: '1' }])
    findMany.mockResolvedValue([product('1', 'DANNY WONKER')])

    vi.setSystemTime(new Date(2026, 9, 31, 12, 0))
    expect(offerIds(await getCachedBestsellers())).toEqual([['1', ['oct']]])
    vi.setSystemTime(new Date(2026, 10, 1, 0, 0, 1))
    expect(offerIds(await getCachedBestsellers())).toEqual([['1', []]])
  })
})
