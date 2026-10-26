import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/product-overrides-store', () => ({ getStorefrontFacetProducts: vi.fn() }))

import { getStorefrontFacetProducts } from '@/lib/product-overrides-store'

beforeEach(() => {
  vi.resetModules()
  vi.mocked(getStorefrontFacetProducts).mockReset()
})

async function freshIndex() {
  return import('./product-search-index')
}

describe('getProductSearchIndex', () => {
  it('reuses one load within the TTL and reloads after it', async () => {
    const { getProductSearchIndex, PRODUCT_SEARCH_INDEX_TTL_MS } = await freshIndex()
    vi.mocked(getStorefrontFacetProducts).mockResolvedValueOnce([{ id: 'a' }] as never).mockResolvedValueOnce([{ id: 'b' }] as never)

    const t0 = 1_000_000
    const [first, concurrent] = await Promise.all([getProductSearchIndex(t0), getProductSearchIndex(t0 + 10)])
    expect(first).toEqual([{ id: 'a' }])
    expect(concurrent).toBe(first)
    expect(await getProductSearchIndex(t0 + PRODUCT_SEARCH_INDEX_TTL_MS - 1)).toBe(first)
    expect(getStorefrontFacetProducts).toHaveBeenCalledTimes(1)

    expect(await getProductSearchIndex(t0 + PRODUCT_SEARCH_INDEX_TTL_MS)).toEqual([{ id: 'b' }])
    expect(getStorefrontFacetProducts).toHaveBeenCalledTimes(2)
  })

  it('does not keep a failed load', async () => {
    const { getProductSearchIndex } = await freshIndex()
    vi.mocked(getStorefrontFacetProducts).mockRejectedValueOnce(new Error('db down')).mockResolvedValueOnce([{ id: 'ok' }] as never)

    await expect(getProductSearchIndex(5)).rejects.toThrow('db down')
    expect(await getProductSearchIndex(6)).toEqual([{ id: 'ok' }])
    expect(getStorefrontFacetProducts).toHaveBeenCalledTimes(2)
  })
})
