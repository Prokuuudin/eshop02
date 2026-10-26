import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/lib/product-overrides-store', () => ({ getMergedProductsByIds: vi.fn() }))
vi.mock('@/lib/product-search-index', () => ({ getProductSearchIndex: vi.fn() }))

import { checkRateLimit } from '@/lib/rate-limit'
import { getMergedProductsByIds } from '@/lib/product-overrides-store'
import { getProductSearchIndex } from '@/lib/product-search-index'
import { GET } from './route'

const INDEX = [
  { id: 'p1', title: 'Matrix Light Master порошок 500 г', titleLv: 'Matrix Light Master balinošais pulveris', brand: 'MATRIX', sku: 'MLM-500', barcode: '3474630161955', category: 'hair', stock: 5, price: 21.5 },
  { id: 'p2', title: 'Matrix Total Results шампунь', brand: 'MATRIX', category: 'hair', stock: 0, price: 9.9 },
  { id: 'p3', title: 'Kallos маска', brand: 'KALLOS', sku: 'K-1', category: 'hair', stock: 3, price: 4 },
  { id: 'p4', title: 'Matrix пилка', brand: 'MATRIX', category: 'nails', stock: 3, price: 2 },
]

function makeRequest(params: string): NextRequest {
  return new NextRequest(`http://localhost/api/search?${params}`, { headers: { 'x-forwarded-for': '203.0.113.20' } })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 29, resetAt: Date.now() + 60_000 })
  vi.mocked(getProductSearchIndex).mockResolvedValue(INDEX as never)
  // Full storefront rows (as getMergedProductsByIds returns them): prices and stock are present here.
  vi.mocked(getMergedProductsByIds).mockImplementation(async (ids: string[]) => ids.map((id) => ({
    ...INDEX.find((p) => p.id === id)!, image: `https://hairshop.lv/${id}.jpg`, oldPrice: 30, bulkPricingTiers: [{ minQuantity: 5, price: 1 }],
  })) as never)
})

describe('GET /api/search', () => {
  it('answers short and empty queries without rate-limit or catalog work', async () => {
    for (const q of ['', 'a', '  b ', '--']) {
      const res = await GET(makeRequest(`q=${encodeURIComponent(q)}`))
      expect(await res.json()).toEqual({ products: [] })
    }
    expect(checkRateLimit).not.toHaveBeenCalled()
    expect(getProductSearchIndex).not.toHaveBeenCalled()
  })

  it('rejects an oversized query and an invalid take before any work', async () => {
    expect((await GET(makeRequest(`q=${'x'.repeat(101)}`))).status).toBe(400)
    expect((await GET(makeRequest('q=matrix&take=11'))).status).toBe(400)
    expect((await GET(makeRequest('q=matrix&take=0'))).status).toBe(400)
    expect(getProductSearchIndex).not.toHaveBeenCalled()
  })

  it('rate-limits by IP before reading the catalog', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 30_000 })
    const res = await GET(makeRequest('q=matrix'))
    expect(res.status).toBe(429)
    expect(res.headers.get('Retry-After')).toBeTruthy()
    expect(checkRateLimit).toHaveBeenCalledWith('search:ip:203.0.113.20', { windowMs: 60_000, maxAttempts: 30 })
    expect(getProductSearchIndex).not.toHaveBeenCalled()
  })

  it('returns at most `take` suggestions, available and relevant first', async () => {
    const res = await GET(makeRequest('q=matrix&take=2'))
    const { products } = await res.json()
    expect(products.map((p: { id: string }) => p.id)).toEqual(['p1', 'p4'])
  })

  it('finds by SKU and by barcode', async () => {
    expect((await (await GET(makeRequest('q=mlm500'))).json()).products.map((p: { id: string }) => p.id)).toEqual(['p1'])
    expect((await (await GET(makeRequest('q=3474630161955'))).json()).products.map((p: { id: string }) => p.id)).toEqual(['p1'])
  })

  it('returns only the suggestion fields: no price, stock, tiers or barcode', async () => {
    const { products } = await (await GET(makeRequest('q=light master&lang=lv'))).json()
    expect(products).toEqual([{
      id: 'p1', title: 'Matrix Light Master balinošais pulveris', brand: 'MATRIX', sku: 'MLM-500', image: 'https://hairshop.lv/p1.jpg',
    }])
  })

  it('narrows by category when given', async () => {
    const { products } = await (await GET(makeRequest('q=matrix&category=nails'))).json()
    expect(products.map((p: { id: string }) => p.id)).toEqual(['p4'])
  })

  it('matches nothing for SQL-like input instead of erroring', async () => {
    const res = await GET(makeRequest(`q=${encodeURIComponent("'; DROP TABLE \"Product\"; --")}`))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ products: [] })
  })

  it('degrades to an empty list when the catalog cannot be read', async () => {
    vi.mocked(getProductSearchIndex).mockRejectedValueOnce(new Error('db down'))
    const res = await GET(makeRequest('q=matrix'))
    expect(await res.json()).toEqual({ products: [] })
  })
})
