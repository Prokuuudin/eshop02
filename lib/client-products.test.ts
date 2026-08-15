import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchAllProducts } from './client-products'

function page(products: { id: string }[], total: number) {
  return { ok: true, json: async () => ({ data: { products, total } }) } as Response
}

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})

describe('fetchAllProducts', () => {
  it('with no limit, pages through the entire catalog (existing behavior)', async () => {
    const calls: string[] = []
    const TOTAL = 350
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      calls.push(String(url))
      const skip = Number(new URL(String(url), 'http://x').searchParams.get('skip'))
      const count = Math.max(0, Math.min(200, TOTAL - skip))
      return page(Array.from({ length: count }, (_, i) => ({ id: `p${skip + i}` })), TOTAL)
    })

    const result = await fetchAllProducts()

    expect(result).toHaveLength(350)
    expect(calls).toHaveLength(2) // 200 + 150
  })

  it('with a limit, stops paging once enough products have been fetched instead of loading the whole catalog', async () => {
    let callCount = 0
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      callCount += 1
      const skip = Number(new URL(String(url), 'http://x').searchParams.get('skip'))
      return page(Array.from({ length: 200 }, (_, i) => ({ id: `p${skip + i}` })), 2000)
    })

    const result = await fetchAllProducts(undefined, 500)

    expect(result).toHaveLength(500)
    // 3 pages of 200 = 600 fetched, then trimmed to 500 - not all 10 pages for 2000 total.
    expect(callCount).toBe(3)
  })

  it('with a limit larger than the whole catalog, just returns everything without over-fetching', async () => {
    vi.mocked(fetch).mockImplementation(async (url: string | URL | Request) => {
      const skip = Number(new URL(String(url), 'http://x').searchParams.get('skip'))
      return page(Array.from({ length: 50 }, (_, i) => ({ id: `p${skip + i}` })), 50)
    })

    const result = await fetchAllProducts(undefined, 500)

    expect(result).toHaveLength(50)
  })
})
