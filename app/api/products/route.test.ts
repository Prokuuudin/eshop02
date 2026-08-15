import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/product-overrides-store', () => ({ getDbProductsPaginated: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/product-price-visibility', () => ({ redactProductPrices: vi.fn((value) => value) }))

import { getDbProductsPaginated } from '@/lib/product-overrides-store'
import { getServerUser } from '@/lib/server-auth'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'u1' } as never)
  vi.mocked(getDbProductsPaginated).mockResolvedValue({ products: [], total: 0 })
})

const request = (query = '') => new NextRequest(`http://localhost/api/products${query}`)

describe('GET /api/products pagination', () => {
  it('uses bounded defaults when pagination is omitted', async () => {
    expect((await GET(request())).status).toBe(200)
    expect(getDbProductsPaginated).toHaveBeenCalledWith({ category: undefined, skip: 0, take: 50 })
  })

  it.each(['?skip=-1', '?skip=x', '?take=0', '?take=201', '?take=1.5'])(
    'rejects invalid pagination %s', async (query) => {
      expect((await GET(request(query))).status).toBe(400)
      expect(getDbProductsPaginated).not.toHaveBeenCalled()
    }
  )

  it('passes category and valid bounds to the store', async () => {
    await GET(request('?category=hair&skip=200&take=100'))
    expect(getDbProductsPaginated).toHaveBeenCalledWith({ category: 'hair', skip: 200, take: 100 })
  })
})

describe('GET /api/products?ids= batch lookup', () => {
  it('fetches exactly the requested ids in one call, ignoring pagination params', async () => {
    await GET(request('?ids=p1,p2, p3'))
    expect(getDbProductsPaginated).toHaveBeenCalledWith({ ids: ['p1', 'p2', 'p3'] })
  })

  it('rejects an empty ids param instead of silently returning everything', async () => {
    const res = await GET(request('?ids=,,'))
    expect(res.status).toBe(400)
    expect(getDbProductsPaginated).not.toHaveBeenCalled()
  })

  it('caps the batch at 100 ids', async () => {
    const many = Array.from({ length: 150 }, (_, i) => `p${i}`).join(',')
    await GET(request(`?ids=${many}`))
    const call = vi.mocked(getDbProductsPaginated).mock.calls[0][0]
    expect(call.ids).toHaveLength(100)
  })
})
