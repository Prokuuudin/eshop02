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
import { getInitialCatalogProducts } from '@/lib/initial-catalog-products'

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
