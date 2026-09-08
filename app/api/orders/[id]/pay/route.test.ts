import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({
  canAccessOrder: vi.fn(),
  getServerOrderById: vi.fn(),
  updateServerOrderPayment: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/paysera', () => ({ createPayseraPaymentForOrder: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { canAccessOrder, getServerOrderById, updateServerOrderPayment } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'
import { createPayseraPaymentForOrder } from '@/lib/paysera'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const ORDER = { id: '1001', email: 'buyer@example.com', userId: 'user-1', paymentMethod: 'paysera', paymentStatus: 'unpaid' }

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/orders/1001/pay', { method: 'POST' })
}

const context = { params: Promise.resolve({ id: '1001' }) }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
})

describe('POST /api/orders/[id]/pay', () => {
  it('returns 404 without leaking existence when the caller cannot access the order', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)
    vi.mocked(getServerUser).mockResolvedValue(null)
    vi.mocked(canAccessOrder).mockReturnValue(false)

    const res = await POST(makeRequest(), context)

    expect(res.status).toBe(404)
    expect(createPayseraPaymentForOrder).not.toHaveBeenCalled()
  })

  it('returns 404 for an order that does not exist', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue(null)

    const res = await POST(makeRequest(), context)

    expect(res.status).toBe(404)
  })

  it('rejects orders that are not paid via paysera', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue({ ...ORDER, paymentMethod: 'bank' } as never)
    vi.mocked(canAccessOrder).mockReturnValue(true)

    const res = await POST(makeRequest(), context)

    expect(res.status).toBe(400)
    expect(createPayseraPaymentForOrder).not.toHaveBeenCalled()
  })

  it('rejects an order that is already paid', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue({ ...ORDER, paymentStatus: 'paid' } as never)
    vi.mocked(canAccessOrder).mockReturnValue(true)

    const res = await POST(makeRequest(), context)

    expect(res.status).toBe(409)
    expect(createPayseraPaymentForOrder).not.toHaveBeenCalled()
  })

  it('mints a fresh payment link and persists the new session id for an owner-accessible unpaid order', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)
    vi.mocked(canAccessOrder).mockReturnValue(true)
    vi.mocked(createPayseraPaymentForOrder).mockResolvedValue({ payseraOrderId: 'pay-9', paymentUrl: 'https://bank.paysera.com/pay/9' })

    const res = await POST(makeRequest(), context)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ paymentUrl: 'https://bank.paysera.com/pay/9' })
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentSessionId: 'pay-9' })
  })

  it('is rate-limited per order id', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)
    vi.mocked(canAccessOrder).mockReturnValue(true)
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })

    const res = await POST(makeRequest(), context)

    expect(res.status).toBe(429)
    expect(createPayseraPaymentForOrder).not.toHaveBeenCalled()
  })

  it('returns 502 when the gateway call fails', async () => {
    vi.mocked(getServerOrderById).mockResolvedValue(ORDER as never)
    vi.mocked(canAccessOrder).mockReturnValue(true)
    vi.mocked(createPayseraPaymentForOrder).mockRejectedValue(new Error('gateway down'))

    const res = await POST(makeRequest(), context)

    expect(res.status).toBe(502)
  })
})
