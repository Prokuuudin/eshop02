import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerUserMock, getOrderMock, canAccessMock, findManyMock } = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
  getOrderMock: vi.fn(),
  canAccessMock: vi.fn(),
  findManyMock: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/orders-data-store', () => ({
  getServerOrderById: getOrderMock,
  canAccessOrder: canAccessMock,
}))
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany: findManyMock } } }))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))

import { POST } from './route'

const request = new NextRequest('https://shop.test/api/orders/o1/repeat', { method: 'POST' })
const context = { params: Promise.resolve({ id: 'o1' }) }

describe('POST /api/orders/[id]/repeat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'buyer@test.com' })
  })

  it('does not expose another customer order', async () => {
    getOrderMock.mockResolvedValue({ id: 'o1', items: [] })
    canAccessMock.mockReturnValue(false)

    expect((await POST(request, context)).status).toBe(404)
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('uses live catalog data, caps stock, and omits unavailable products', async () => {
    getOrderMock.mockResolvedValue({
      id: 'o1',
      items: [
        { id: 'p1', title: 'Old title', brand: 'Old', price: 10, quantity: 5, lineKey: 'p1' },
        { id: 'gone', title: 'Gone', brand: 'Old', price: 3, quantity: 1, lineKey: 'gone' },
      ],
    })
    canAccessMock.mockReturnValue(true)
    findManyMock.mockResolvedValue([{
      id: 'p1', title: 'Current title', titleKey: null, titleEn: null, titleLv: null,
      brand: 'Current', image: '/p1.jpg', images: [], price: 12, stock: 3,
      bonusRate: 2, bulkPricingTiers: [], minOrderQuantities: null,
      category: 'hair', sku: 'SKU-1',
    }])

    const response = await POST(request, context)
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.items).toEqual([expect.objectContaining({
      id: 'p1', title: 'Current title', brand: 'Current', price: 12, quantity: 3,
    })])
    expect(body.changes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'p1', type: 'price_changed', oldValue: 10, newValue: 12 }),
      expect.objectContaining({ id: 'p1', type: 'quantity_changed', oldValue: 5, newValue: 3 }),
    ]))
    expect(body.unavailableItems).toEqual([{ id: 'gone', title: 'Gone' }])
  })
})
