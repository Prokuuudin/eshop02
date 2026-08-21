import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({
  canAccessOrder: vi.fn(),
  getServerOrderById: vi.fn(),
  updateServerOrderPayment: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: vi.fn(),
  requireAdmin: vi.fn(),
}))

import { canAccessOrder, getServerOrderById, updateServerOrderPayment } from '@/lib/orders-data-store'
import { getServerUser, requireAdmin } from '@/lib/server-auth'
import { GET, PATCH } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }
const ORDER = { id: '1001', email: 'buyer@example.com', userId: 'user-1', paymentStatus: 'unpaid' }

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/orders/1001')
}

function makePatchRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/orders/1001', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const context = { params: Promise.resolve({ id: '1001' }) }

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/orders/[id]', () => {
  it('returns 404 without leaking existence when the caller cannot access the order', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)
    vi.mocked(getServerUser).mockResolvedValue(null)
    vi.mocked(canAccessOrder).mockReturnValue(false)

    const res = await GET(makeGetRequest(), context)

    expect(res.status).toBe(404)
  })

  it('returns the order for a caller allowed to see it', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)
    vi.mocked(getServerUser).mockResolvedValue(null)
    vi.mocked(canAccessOrder).mockReturnValue(true)

    const res = await GET(makeGetRequest(), context)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.order.id).toBe('1001')
  })
})

describe('PATCH /api/orders/[id] — manual payment confirmation', () => {
  it('rejects a non-admin before touching the order', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const res = await PATCH(makePatchRequest({ paymentStatus: 'paid', paymentProvider: 'manual' }), context)

    expect(res.status).toBe(403)
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
  })

  it('marks the order paid when an admin confirms it manually', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(updateServerOrderPayment).mockResolvedValue({ ...ORDER, paymentStatus: 'paid', paymentProvider: 'manual' } as never)

    const res = await PATCH(makePatchRequest({ paymentStatus: 'paid', paymentProvider: 'manual' }), context)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.order.paymentStatus).toBe('paid')
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', {
      paymentStatus: 'paid',
      paymentProvider: 'manual',
      paymentSessionId: undefined,
    })
  })

  it('returns 404 for an order that does not exist', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(updateServerOrderPayment).mockResolvedValue(null)

    const res = await PATCH(makePatchRequest({ paymentStatus: 'paid' }), context)

    expect(res.status).toBe(404)
  })
})
