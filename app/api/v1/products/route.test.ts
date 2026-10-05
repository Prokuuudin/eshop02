import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/api-helpers', () => ({
  authenticateRequest: vi.fn(async () => ({ authenticated: true, user: { id: 'test', apiAccess: true } })),
  parsePagination: (request: NextRequest) => {
    const page = Number(request.nextUrl.searchParams.get('page') ?? 1)
    const limit = Number(request.nextUrl.searchParams.get('limit') ?? 20)
    return { page, limit, offset: (page - 1) * limit }
  },
  parseFilters: (request: NextRequest) => {
    const params = request.nextUrl.searchParams
    return {
      category: params.get('category') ?? undefined,
      search: params.get('search') ?? undefined,
      minPrice: params.has('minPrice') ? Number(params.get('minPrice')) : undefined,
      maxPrice: params.has('maxPrice') ? Number(params.get('maxPrice')) : undefined,
    }
  },
  successResponse: (data: unknown) => Response.json({ success: true, data }),
  errorResponse: (message: string, status = 400) => Response.json({ error: message }, { status }),
}))
vi.mock('@/lib/product-overrides-store', () => ({ getDbProductsPaginated: vi.fn() }))

import { getDbProductsPaginated } from '@/lib/product-overrides-store'
import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getDbProductsPaginated).mockResolvedValue({ products: [], total: 81 })
})

describe('GET /api/v1/products', () => {
  it('pushes filters and pagination into the bounded repository query', async () => {
    const request = new NextRequest('http://localhost/api/v1/products?page=5&limit=20&category=hair&search=mask&minPrice=5&maxPrice=30', {
      headers: { 'x-api-key': 'test-key' },
    })
    const response = await GET(request)

    expect(response.status).toBe(200)
    expect(getDbProductsPaginated).toHaveBeenCalledWith({
      category: 'hair', search: 'mask', minPrice: 5, maxPrice: 30, skip: 80, take: 20,
    })
    const body = await response.json()
    expect(body.data.pagination).toEqual({ page: 5, limit: 20, total: 81, pages: 5 })
  })
})
