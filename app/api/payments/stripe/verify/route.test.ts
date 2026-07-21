import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/stripe-client', () => ({ createStripeClient: vi.fn() }))
vi.mock('@/lib/stripe-payment-store', () => ({
  getOrderPaymentBySessionId: vi.fn(),
  saveOrderPaymentStatus: vi.fn(),
}))
vi.mock('@/lib/orders-data-store', () => ({
  canAccessOrder: vi.fn(),
  getServerOrderById: vi.fn(),
  updateServerOrderPayment: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { createStripeClient } from '@/lib/stripe-client'
import { getOrderPaymentBySessionId } from '@/lib/stripe-payment-store'
import { canAccessOrder, getServerOrderById } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const retrieve = vi.fn()
const SESSION_ID = 'cs_test_valid123456789'

function makeRequest(sessionId: unknown, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/payments/stripe/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ sessionId }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_secret'
  vi.mocked(createStripeClient).mockReturnValue({ checkout: { sessions: { retrieve } } } as never)
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  vi.mocked(getServerUser).mockResolvedValue(null)
})

describe('POST /api/payments/stripe/verify', () => {
  it('rejects malformed and oversized ids before rate-limit, DB, or Stripe work', async () => {
    const res = await POST(makeRequest(`pi_${'x'.repeat(300)}`))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_session_id')
    expect(checkRateLimit).not.toHaveBeenCalled()
    expect(getOrderPaymentBySessionId).not.toHaveBeenCalled()
    expect(createStripeClient).not.toHaveBeenCalled()
  })

  it('rate-limits before looking up or retrieving a Stripe session', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest(SESSION_ID, { 'x-forwarded-for': '203.0.113.4' }))
    expect(res.status).toBe(429)
    expect(getOrderPaymentBySessionId).not.toHaveBeenCalled()
    expect(createStripeClient).not.toHaveBeenCalled()
  })

  it('rejects an unknown cs_* id before calling Stripe', async () => {
    vi.mocked(getOrderPaymentBySessionId).mockResolvedValue(null)
    const res = await POST(makeRequest(SESSION_ID))
    expect(res.status).toBe(404)
    expect(createStripeClient).not.toHaveBeenCalled()
    expect(retrieve).not.toHaveBeenCalled()
  })

  it('retrieves a locally bound guest checkout session', async () => {
    vi.mocked(getOrderPaymentBySessionId).mockResolvedValue({
      orderId: 'o1', paymentStatus: 'pending', sessionId: SESSION_ID,
      customerEmail: 'buyer@example.com', updatedAt: new Date().toISOString(),
    })
    vi.mocked(getServerOrderById).mockResolvedValue({
      id: 'o1', userId: undefined, email: 'buyer@example.com',
    } as never)
    vi.mocked(canAccessOrder).mockReturnValue(false)
    retrieve.mockResolvedValue({
      id: SESSION_ID, status: 'complete', payment_status: 'paid',
      metadata: { orderId: 'o1' }, customer_details: { email: 'buyer@example.com' },
      payment_intent: 'pi_1',
    })

    const res = await POST(makeRequest(SESSION_ID))
    expect(res.status).toBe(200)
    expect(retrieve).toHaveBeenCalledWith(SESSION_ID)
  })
})
