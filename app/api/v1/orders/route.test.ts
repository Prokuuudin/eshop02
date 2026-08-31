import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { authenticateMock, pricingMock, persistMock, productFindMock, orderFindMock, orderCountMock } = vi.hoisted(() => ({
  authenticateMock: vi.fn(), pricingMock: vi.fn(), persistMock: vi.fn(),
  productFindMock: vi.fn(), orderFindMock: vi.fn(), orderCountMock: vi.fn(),
}))
vi.mock('@/lib/api-helpers', () => ({
  authenticateRequest: authenticateMock,
  parsePagination: () => ({ page: 1, limit: 20, offset: 0 }),
  errorResponse: (error: string, status = 400) => NextResponse.json({ error }, { status }),
  successResponse: (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status }),
}))
vi.mock('@/lib/server-pricing', () => ({ recomputeOrderPricing: pricingMock }))
vi.mock('@/lib/orders-data-store', async () => {
  class InsufficientStockError extends Error { constructor(public items: string[]) { super('stock') } }
  class ExistingCheckoutOrderError extends Error { constructor(public order: { id: string }) { super('existing') } }
  return { createServerOrder: persistMock, InsufficientStockError, ExistingCheckoutOrderError }
})
vi.mock('@/lib/prisma', () => ({ prisma: {
  product: { findMany: productFindMock }, order: { findMany: orderFindMock, count: orderCountMock },
} }))

import { GET, POST } from './route'
import { ExistingCheckoutOrderError, InsufficientStockError } from '@/lib/orders-data-store'

const request = (method: string, body?: unknown, query = '', idempotencyKey?: string) => new NextRequest(`https://shop.test/api/v1/orders${query}`, {
  method, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  headers: idempotencyKey ? { 'idempotency-key': idempotencyKey } : undefined,
})

describe('/api/v1/orders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateMock.mockResolvedValue({ authenticated: true, user: {
      id: 'api-user', email: 'buyer@test.com', companyId: 'company-a', apiAccess: true,
    } })
    persistMock.mockImplementation(async (order, prepare) => ({ id: '1001', ...(await prepare({} as never)) }))
  })

  it('requires company scope before listing orders', async () => {
    authenticateMock.mockResolvedValue({ authenticated: true, user: { id: 'u1', apiAccess: true } })
    expect((await GET(request('GET'))).status).toBe(400)
    expect(orderFindMock).not.toHaveBeenCalled()
  })

  it('always scopes list queries to the authenticated company', async () => {
    orderFindMock.mockResolvedValue([])
    orderCountMock.mockResolvedValue(0)
    const response = await GET(request('GET', undefined, '?paymentStatus=paid&sortBy=total&sortOrder=asc'))
    expect(response.status).toBe(200)
    expect(orderFindMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { companyId: 'company-a', paymentStatus: 'paid' }, orderBy: { total: 'asc' },
    }))
  })

  it('rejects writes from a browser session without API write access', async () => {
    authenticateMock.mockResolvedValue({ authenticated: true, user: { id: 'u1', companyId: 'company-a', apiAccess: false } })
    expect((await POST(request('POST', { items: [{ productId: 'p1', quantity: 1 }], address: {} }))).status).toBe(403)
    expect(pricingMock).not.toHaveBeenCalled()
  })

  it('requires a company scope for API writes', async () => {
    authenticateMock.mockResolvedValue({ authenticated: true, user: { id: 'api-user', apiAccess: true } })
    const response = await POST(request('POST', { items: [{ productId: 'p1', quantity: 1 }], address: {} }))
    expect(response.status).toBe(400)
    expect(pricingMock).not.toHaveBeenCalled()
  })

  it('ignores client prices and persists totals returned by server pricing', async () => {
    pricingMock.mockResolvedValue({
      items: [{ id: 'p1', quantity: 2, price: 50 }], subtotal: 100, tax: 21, delivery: 0,
      discount: 0, total: 121, promoApplied: false,
    })
    productFindMock.mockResolvedValue([{ id: 'p1', title: 'Trusted title', brand: 'Brand', image: null, category: 'hair', rating: 5, stock: 8 }])
    const response = await POST(request('POST', {
      items: [{ productId: 'p1', quantity: 2, price: 0.01 }], address: { firstName: 'A' }, total: 0.01,
    }))
    expect(response.status).toBe(201)
    expect(pricingMock).toHaveBeenCalledWith(expect.objectContaining({ items: [{ id: 'p1', quantity: 2 }] }), expect.anything())
    const responseBody = await response.json()
    expect(responseBody.data).toMatchObject({ orderId: '1001', total: 121 })
  })

  it('maps stock conflicts to 409 without hiding the affected products', async () => {
    pricingMock.mockRejectedValue(new InsufficientStockError(['p1']))
    const response = await POST(request('POST', { items: [{ productId: 'p1', quantity: 5 }], address: {} }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'Insufficient stock for: p1' })
    expect(persistMock).toHaveBeenCalledOnce()
  })

  it('returns an existing tenant order for a repeated idempotency key', async () => {
    persistMock.mockRejectedValue(new ExistingCheckoutOrderError({
      id: '1001', total: 121, paymentStatus: 'unpaid', createdAt: '2026-08-31T00:00:00Z',
    } as never))
    productFindMock.mockResolvedValue([])
    const response = await POST(request('POST', {
      items: [{ productId: 'p1', quantity: 1 }], address: {},
    }, '', 'integration-request-123'))
    expect(response.status).toBe(200)
    expect((await response.json()).data).toMatchObject({ orderId: '1001', idempotent: true })
    const persisted = persistMock.mock.calls[0][0]
    expect(persisted.checkoutKey).toMatch(/^[a-f0-9]{64}$/)
  })
})
