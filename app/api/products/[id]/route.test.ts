import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/product-overrides-store', () => ({ getMergedProductById: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/product-price-visibility', () => ({ redactProductPrices: vi.fn((value) => value) }))

import { getMergedProductById } from '@/lib/product-overrides-store'
import { getServerUser } from '@/lib/server-auth'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'user-1' } as never)
})

describe('GET /api/products/[id]', () => {
  it('uses the dedicated single-product loader and preserves the response shape', async () => {
    vi.mocked(getMergedProductById).mockResolvedValue({ id: '19073', title: 'Product' } as never)
    const response = await GET(new Request('http://localhost/api/products/19073'), {
      params: Promise.resolve({ id: '19073' }),
    })

    expect(response.status).toBe(200)
    expect(getMergedProductById).toHaveBeenCalledWith('19073')
    expect(await response.json()).toEqual({ product: { id: '19073', title: 'Product' } })
  })

  it('returns the existing 404 contract for a missing id', async () => {
    vi.mocked(getMergedProductById).mockResolvedValue(null)
    const response = await GET(new Request('http://localhost/api/products/missing'), {
      params: Promise.resolve({ id: 'missing' }),
    })

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ product: null })
  })
})
