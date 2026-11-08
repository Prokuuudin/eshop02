import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn(async () => ({ id: 'user-1' })) }))
vi.mock('@/lib/product-overrides-store', () => ({
  getDbProductsPaginated: vi.fn(),
  getMergedProductsByIds: vi.fn(),
  getStorefrontBrandNames: vi.fn(async () => []),
  getStorefrontFacetProducts: vi.fn(),
}))

import {
  getDbProductsPaginated,
  getMergedProductsByIds,
  getStorefrontFacetProducts,
} from '@/lib/product-overrides-store'
import { getServerUser } from '@/lib/server-auth'
import { getCatalogFacets, getInitialCatalogProducts } from '@/lib/initial-catalog-products'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getDbProductsPaginated).mockResolvedValue({ products: [], total: 120 })
  vi.mocked(getMergedProductsByIds).mockResolvedValue([])
  vi.mocked(getStorefrontFacetProducts).mockResolvedValue([])
})

describe('getInitialCatalogProducts query bounds', () => {
  it('orders the entire matching result before fetching only page 5', async () => {
    const products = Array.from({ length: 120 }, (_, index) => ({
      id: `product-${index}`, title: `Product ${index}`, brand: 'Brand',
      price: 10, rating: 0, category: 'hair' as const, stock: index < 24 ? 0 : 1,
    }))
    vi.mocked(getStorefrontFacetProducts).mockResolvedValue(products)

    const result = await getInitialCatalogProducts({ language: 'lv', page: 5 })

    expect(getDbProductsPaginated).not.toHaveBeenCalled()
    expect(getMergedProductsByIds).toHaveBeenCalledWith(products.slice(0, 24).map(({ id }) => id))
    expect(result).toMatchObject({ page: 5, pageSize: 24, totalProducts: 120, totalPages: 5 })
  })

  it.each(['price-asc', 'price-desc', 'name-asc', 'name-desc', undefined])(
    'keeps unavailable products last with %s ordering after filtering', async (order) => {
      vi.mocked(getStorefrontFacetProducts).mockResolvedValue([
        { id: 'out', title: 'A', brand: 'Brand', price: 1, rating: 0, category: 'hair', stock: 0 },
        { id: 'other-category', title: 'B', brand: 'Brand', price: 2, rating: 0, category: 'face', stock: 1 },
        { id: 'in', title: 'Z', brand: 'Brand', price: 20, rating: 0, category: 'hair', stock: 1 },
      ])

      await getInitialCatalogProducts({ language: 'ru', category: 'hair', order })

      expect(getMergedProductsByIds).toHaveBeenCalledWith(['in', 'out'])
    }
  )

  it('keeps exact sale semantics on a narrow scan and fetches only the selected card ids', async () => {
    vi.mocked(getStorefrontFacetProducts).mockResolvedValue([
      { id: 'sale-1', title: 'Sale', brand: 'Brand', price: 10, oldPrice: 20, rating: 0, category: 'hair', stock: 1 },
      { id: 'regular-1', title: 'Regular', brand: 'Brand', price: 10, rating: 0, category: 'hair', stock: 1 },
    ])
    vi.mocked(getMergedProductsByIds).mockResolvedValue([
      { id: 'sale-1', title: 'Sale', brand: 'Brand', price: 10, oldPrice: 20, rating: 0, category: 'hair', stock: 1 },
    ])

    const result = await getInitialCatalogProducts({ language: 'en', onSale: true })

    expect(getDbProductsPaginated).not.toHaveBeenCalled()
    expect(getMergedProductsByIds).toHaveBeenCalledWith(['sale-1'])
    expect(result.products.map((product) => product.id)).toEqual(['sale-1'])
  })
})

describe('getCatalogFacets brand facet', () => {
  const product = (id: string, brand: string, category: 'hair' | 'face' = 'hair') =>
    ({ id, title: id, brand, price: 10, rating: 0, category, stock: 1 })

  beforeEach(() => {
    vi.mocked(getStorefrontFacetProducts).mockResolvedValue([
      product('1', 'Zeta Pro'), product('2', 'Alpha'), product('3', 'Zeta Pro'),
      product('4', 'Mid Brand', 'face'), product('5', 'Alpha'), product('6', 'Zéta Pro'),
    ])
  })

  it('lists brands in first-appearance order with their own counts when nothing is selected', async () => {
    const facets = await getCatalogFacets({ language: 'lv' })
    expect(facets.availableBrands).toEqual(['zeta-pro', 'alpha', 'mid-brand'])
    expect(facets.brandCounts).toEqual({ 'zeta-pro': 3, alpha: 2, 'mid-brand': 1 })
  })

  it('counts a selected brand alone and an unselected brand together with the selection', async () => {
    const facets = await getCatalogFacets({ language: 'lv', brands: ['alpha', 'alpha', 'unknown'] })
    expect(facets.availableBrands).toEqual(['zeta-pro', 'alpha', 'mid-brand'])
    expect(facets.brandCounts).toEqual({ 'zeta-pro': 5, alpha: 2, 'mid-brand': 3 })
  })

  it('applies the other filters before counting brands', async () => {
    const facets = await getCatalogFacets({ language: 'lv', category: 'hair', brands: ['zeta-pro'] })
    expect(facets.availableBrands).toEqual(['zeta-pro', 'alpha'])
    expect(facets.brandCounts).toEqual({ 'zeta-pro': 3, alpha: 5 })
  })
})

describe('guest price oracle (B2B prices must not be inferable)', () => {
  // Storage order differs from both price orders, so an applied price sort is observable.
  const catalog = [
    { id: 'dear', title: 'C dear', brand: 'Brand', price: 50, rating: 0, category: 'hair' as const, stock: 1 },
    { id: 'cheap', title: 'A cheap', brand: 'Brand', price: 5, rating: 0, category: 'hair' as const, stock: 1 },
    { id: 'mid', title: 'B mid', brand: 'Brand', price: 20, rating: 0, category: 'hair' as const, stock: 1 },
  ]
  const asGuest = (): void => { vi.mocked(getServerUser).mockResolvedValue(null) }
  const asCustomer = (): void => { vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never) }

  beforeEach(() => {
    vi.mocked(getStorefrontFacetProducts).mockResolvedValue(catalog)
    vi.mocked(getMergedProductsByIds).mockImplementation(async (ids: string[]) =>
      ids.map((id) => catalog.find((product) => product.id === id)!))
  })

  it('ignores minPrice/maxPrice for guests: membership and totals stay price-independent', async () => {
    asGuest()
    const result = await getInitialCatalogProducts({ language: 'lv', minPrice: 19.99, maxPrice: 20.01 })
    expect(result.totalProducts).toBe(3)
    expect(getMergedProductsByIds).toHaveBeenCalledWith(['dear', 'cheap', 'mid'])
  })

  it('never returns prices to guests', async () => {
    asGuest()
    const result = await getInitialCatalogProducts({ language: 'en' })
    for (const product of result.products) expect(product).not.toHaveProperty('price')
  })

  it.each(['price-asc', 'price-desc'])('ignores %s ordering for guests', async (order) => {
    asGuest()
    await getInitialCatalogProducts({ language: 'ru', order })
    expect(getMergedProductsByIds).toHaveBeenCalledWith(['dear', 'cheap', 'mid'])
  })

  it('keeps non-price ordering for guests', async () => {
    asGuest()
    await getInitialCatalogProducts({ language: 'en', order: 'name-desc' })
    expect(getMergedProductsByIds).toHaveBeenCalledWith(['dear', 'mid', 'cheap'])
  })

  it('ignores the price range in guest facet counts', async () => {
    asGuest()
    const facets = await getCatalogFacets({ language: 'lv', minPrice: 19.99, maxPrice: 20.01 })
    expect(facets.groupCounts['']).toBe(3)
    expect(facets.brandCounts).toEqual({ brand: 3 })
  })

  it('keeps price filters, ordering and facet counts for authenticated customers', async () => {
    asCustomer()
    const filtered = await getInitialCatalogProducts({ language: 'lv', minPrice: 19.99, maxPrice: 20.01 })
    expect(filtered.totalProducts).toBe(1)
    expect(filtered.products[0]).toMatchObject({ id: 'mid', price: 20 })

    vi.mocked(getMergedProductsByIds).mockClear()
    await getInitialCatalogProducts({ language: 'lv', order: 'price-desc' })
    expect(getMergedProductsByIds).toHaveBeenCalledWith(['dear', 'mid', 'cheap'])

    const facets = await getCatalogFacets({ language: 'lv', minPrice: 19.99, maxPrice: 20.01 })
    expect(facets.groupCounts['']).toBe(1)
  })
})
