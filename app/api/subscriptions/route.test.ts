import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const subscriptionCreateMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => ({ prisma: {
  product: { findUnique: vi.fn() }, productSubscription: { create: subscriptionCreateMock, findMany: vi.fn() },
} }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { POST } from './route'

function makeRequest(overrides: Record<string, unknown> = {}) {
  return new NextRequest('http://localhost/api/subscriptions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      productId: 'p1', pricePerUnit: 0.01, discountPercent: 99,
      productTitle: 'Forged', productImage: 'evil', quantity: 2,
      interval: 'monthly', nextOrderDate: '2026-08-21T00:00:00.000Z', ...overrides,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'u@example.com' } as never)
  vi.mocked(prisma.product.findUnique).mockResolvedValue({
    id: 'p1', title: 'DB product', image: '/db.jpg', price: 42.5, isActive: true, isDeleted: false,
  } as never)
  subscriptionCreateMock.mockImplementation(async ({ data }) => ({ ...data }))
})

describe('POST /api/subscriptions', () => {
  it('uses DB product data and a server-side interval discount', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(201)
    const data = vi.mocked(prisma.productSubscription.create).mock.calls[0][0].data
    expect(data).toMatchObject({
      productTitle: 'DB product', productImage: '/db.jpg', pricePerUnit: 42.5,
      discountPercent: 10, interval: 'monthly',
    })
  })

  it('rejects an unsupported interval before creating a subscription', async () => {
    const res = await POST(makeRequest({ interval: 'daily' }))
    expect(res.status).toBe(400)
    expect(prisma.product.findUnique).not.toHaveBeenCalled()
    expect(prisma.productSubscription.create).not.toHaveBeenCalled()
  })
})
