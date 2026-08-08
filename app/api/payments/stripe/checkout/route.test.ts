import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/stripe-client', () => ({ createStripeClient: vi.fn() }))
vi.mock('@/lib/stripe-payment-store', () => ({
  getOrderPaymentStatus: vi.fn(),
  saveOrderPaymentStatus: vi.fn(),
}))
vi.mock('@/lib/orders-data-store', () => ({
  canAccessOrder: vi.fn(),
  getServerOrderById: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://shop.test' }))

import { createStripeClient } from '@/lib/stripe-client'
import { getOrderPaymentStatus, saveOrderPaymentStatus } from '@/lib/stripe-payment-store'
import { canAccessOrder, getServerOrderById } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'
import { POST } from './route'

const create = vi.fn()
const retrieve = vi.fn()

function request() {
  return new NextRequest('https://shop.test/api/payments/stripe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://shop.test' },
    body: JSON.stringify({ orderId: 'order-1', email: 'buyer@example.com' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_secret'
  vi.mocked(createStripeClient).mockReturnValue({ checkout: { sessions: { create, retrieve } } } as never)
  vi.mocked(getServerUser).mockResolvedValue(null)
  vi.mocked(canAccessOrder).mockReturnValue(false)
  vi.mocked(getServerOrderById).mockResolvedValue({
    id: 'order-1', email: 'buyer@example.com', userId: undefined,
    paymentStatus: 'pending', stockReservationStatus: 'reserved', total: 10,
    delivery: 0, items: [{ id: 'p1', title: 'Product', price: 10, quantity: 1 }],
  } as never)
})

describe('POST /api/payments/stripe/checkout', () => {
  it('fails closed before order or Stripe work when the secret is missing', async () => {
    delete process.env.STRIPE_SECRET_KEY
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect(getServerOrderById).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('reuses the currently open Checkout Session instead of creating a duplicate', async () => {
    vi.mocked(getOrderPaymentStatus).mockResolvedValue({
      orderId: 'order-1', paymentStatus: 'pending', sessionId: 'cs_active',
      updatedAt: new Date().toISOString(),
    })
    retrieve.mockResolvedValue({
      id: 'cs_active', status: 'open', url: 'https://checkout.stripe.test/active', amount_total: 1000,
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ sessionId: 'cs_active', reused: true })
    expect(create).not.toHaveBeenCalled()
    expect(saveOrderPaymentStatus).not.toHaveBeenCalled()
  })

  it('replaces a closed session with an idempotently created active session', async () => {
    vi.mocked(getOrderPaymentStatus).mockResolvedValue({
      orderId: 'order-1', paymentStatus: 'pending', sessionId: 'cs_closed',
      updatedAt: new Date().toISOString(),
    })
    retrieve.mockResolvedValue({ id: 'cs_closed', status: 'expired', url: null })
    create.mockResolvedValue({ id: 'cs_new', url: 'https://checkout.stripe.test/new', payment_intent: null })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(create).toHaveBeenCalledWith(expect.any(Object), {
      idempotencyKey: 'order-checkout-order-1-cs_closed',
    })
    expect(saveOrderPaymentStatus).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 'order-1', sessionId: 'cs_new', replaceSession: true,
    }))
  })
})
