import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const upsertMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findUnique: vi.fn() },
    productNewsSubscription: { findMany: vi.fn(), upsert: upsertMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { GET, POST } from './route'

function makeRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/product-news', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: 'p1', ...overrides }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'u@example.com' } as never)
  vi.mocked(prisma.product.findUnique).mockResolvedValue({
    id: 'p1', title: 'Shampoo', isActive: true, isDeleted: false,
  } as never)
  upsertMock.mockResolvedValue({ id: 'sub-1' })
})

describe('GET /api/product-news', () => {
  it('rejects anonymous callers', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
  })
})

describe('POST /api/product-news', () => {
  it('upserts by userId+productId with the default flags all true', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(201)
    expect(upsertMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_productId: { userId: 'u1', productId: 'p1' } },
      create: expect.objectContaining({ notifyPrice: true, notifyStock: true, notifyPromo: true }),
      update: { notifyPrice: true, notifyStock: true, notifyPromo: true },
    }))
  })

  it('rejects a request with every flag turned off', async () => {
    const res = await POST(makeRequest({ notifyPrice: false, notifyStock: false, notifyPromo: false }))
    expect(res.status).toBe(400)
    expect(upsertMock).not.toHaveBeenCalled()
  })

  it('404s for a product that does not exist or is inactive', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest())
    expect(res.status).toBe(404)
  })
})
