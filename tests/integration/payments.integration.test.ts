import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  constructEvent: vi.fn(),
  resolveLineItems: vi.fn(),
  getServerOrderById: vi.fn(),
  canAccessOrder: vi.fn(),
  getServerUser: vi.fn(),
  saveOrderPaymentStatus: vi.fn(),
  applyStripePaymentEvent: vi.fn(),
}))

vi.mock('@/lib/stripe-client', () => ({
  createStripeClient: () => ({
    checkout: { sessions: { create: mocks.createSession } },
    webhooks: { constructEvent: mocks.constructEvent },
  }),
}))

vi.mock('@/lib/server-pricing', () => ({ resolveLineItems: mocks.resolveLineItems }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: mocks.getServerUser }))
vi.mock('@/lib/orders-data-store', () => ({
  getServerOrderById: mocks.getServerOrderById,
  canAccessOrder: mocks.canAccessOrder,
}))
vi.mock('@/lib/stripe-payment-store', () => ({
  saveOrderPaymentStatus: mocks.saveOrderPaymentStatus,
  applyStripePaymentEvent: mocks.applyStripePaymentEvent,
}))

import { NextRequest } from 'next/server'
import { POST as checkout } from '@/app/api/payments/stripe/checkout/route'
import { POST as webhook } from '@/app/api/payments/stripe/webhook/route'

const order = {
  id: '1001',
  email: 'buyer@example.com',
  userId: 'user-1',
  paymentStatus: 'unpaid',
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_integration'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_integration'
  mocks.getServerOrderById.mockResolvedValue(order)
  mocks.getServerUser.mockResolvedValue({ id: 'user-1' })
  mocks.canAccessOrder.mockReturnValue(true)
  mocks.resolveLineItems.mockResolvedValue([
    { id: 'p1', quantity: 2, price: 12.5, bonusRate: 0, fromCatalog: true },
  ])
  mocks.createSession.mockResolvedValue({
    id: 'cs_1001',
    url: 'https://checkout.stripe.test/cs_1001',
    payment_intent: 'pi_1001',
  })
  mocks.saveOrderPaymentStatus.mockResolvedValue({})
  mocks.applyStripePaymentEvent.mockResolvedValue(true)
})

describe('Stripe payment integration', () => {
  it('creates checkout from authoritative catalog prices and persists pending state', async () => {
    const request = new NextRequest('https://shop.test/api/payments/stripe/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://shop.test' },
      body: JSON.stringify({
        orderId: '1001',
        email: 'buyer@example.com',
        grandTotal: 0.01,
        items: [{ id: 'p1', title: 'Shampoo', quantity: 2, price: 0.01 }],
      }),
    })

    const response = await checkout(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.amountExpected).toBe(2500)
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [expect.objectContaining({
          quantity: 2,
          price_data: expect.objectContaining({ unit_amount: 1250, currency: 'eur' }),
        })],
        metadata: { orderId: '1001' },
      })
    )
    expect(mocks.saveOrderPaymentStatus).toHaveBeenCalledWith(expect.objectContaining({
      orderId: '1001',
      paymentStatus: 'pending',
      sessionId: 'cs_1001',
    }))
  })

  it('applies a completed webhook once and treats a retry as idempotent', async () => {
    const event = {
      id: 'evt_completed_1001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1001',
          payment_intent: 'pi_1001',
          metadata: { orderId: '1001' },
          customer_details: { email: 'buyer@example.com' },
        },
      },
    }
    mocks.constructEvent.mockReturnValue(event)
    mocks.applyStripePaymentEvent
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false)

    const makeRequest = () => new NextRequest('https://shop.test/api/payments/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid-signature' },
      body: JSON.stringify(event),
    })

    const first = await webhook(makeRequest())
    const second = await webhook(makeRequest())

    expect(first.status).toBe(200)
    expect(await second.json()).toEqual({ received: true, idempotent: true })
    expect(mocks.applyStripePaymentEvent).toHaveBeenCalledTimes(2)
    expect(mocks.applyStripePaymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'evt_completed_1001',
      paymentStatus: 'paid',
    }))
  })
})
