import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  constructEvent: vi.fn(),
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

// order.total (30) = subtotal (2 x 12.50 = 25) + delivery (5). This is the only source of truth
// for what Stripe should charge — the checkout route must ignore client-supplied items/grandTotal.
const order = {
  id: '1001',
  email: 'buyer@example.com',
  userId: 'user-1',
  paymentStatus: 'unpaid',
  items: [{ id: 'p1', title: 'Shampoo', quantity: 2, price: 12.5 }],
  subtotal: 25,
  delivery: 5,
  total: 30,
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_integration'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_integration'
  mocks.getServerOrderById.mockResolvedValue(order)
  mocks.getServerUser.mockResolvedValue({ id: 'user-1' })
  mocks.canAccessOrder.mockReturnValue(true)
  mocks.createSession.mockResolvedValue({
    id: 'cs_1001',
    url: 'https://checkout.stripe.test/cs_1001',
    payment_intent: 'pi_1001',
  })
  mocks.saveOrderPaymentStatus.mockResolvedValue({})
  mocks.applyStripePaymentEvent.mockResolvedValue(true)
})

describe('Stripe payment integration', () => {
  it('builds the Stripe session from the stored order, ignoring client-supplied items/grandTotal', async () => {
    const request = new NextRequest('https://shop.test/api/payments/stripe/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: 'https://shop.test' },
      body: JSON.stringify({
        orderId: '1001',
        email: 'buyer@example.com',
        // Tampered: claims a single item at 1 cent — an attacker trying to pay far less than
        // order.total (30). The route must not use any of this for pricing.
        grandTotal: 0.01,
        items: [{ id: 'p1', title: 'Shampoo', quantity: 1, price: 0.01 }],
      }),
    })

    const response = await checkout(request)
    const payload = await response.json()

    expect(response.status).toBe(200)
    // order.total (30) in cents — not the tampered 1 cent from the request body.
    expect(payload.amountExpected).toBe(3000)
    expect(mocks.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({ unit_amount: 2500, currency: 'eur' }),
          }),
          expect.objectContaining({
            quantity: 1,
            price_data: expect.objectContaining({ unit_amount: 500, currency: 'eur' }),
          }),
        ],
        metadata: { orderId: '1001' },
      })
    )
    const [[sessionArgs]] = mocks.createSession.mock.calls
    const chargedCents = sessionArgs.line_items.reduce(
      (sum: number, li: { quantity: number; price_data: { unit_amount: number } }) =>
        sum + li.quantity * li.price_data.unit_amount,
      0
    )
    expect(chargedCents).toBe(3000)

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
          amount_total: 3000,
          currency: 'eur',
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

  it('refuses to mark an order paid when the Stripe session amount is less than order.total', async () => {
    const event = {
      id: 'evt_underpaid_1001',
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_1001',
          payment_intent: 'pi_1001',
          metadata: { orderId: '1001' },
          customer_details: { email: 'buyer@example.com' },
          // order.total is 30 EUR (3000 cents) — this session only collected 1 cent.
          amount_total: 1,
          currency: 'eur',
        },
      },
    }
    mocks.constructEvent.mockReturnValue(event)

    const request = new NextRequest('https://shop.test/api/payments/stripe/webhook', {
      method: 'POST',
      headers: { 'stripe-signature': 'valid-signature' },
      body: JSON.stringify(event),
    })

    const response = await webhook(request)

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ received: true, amountMismatch: true })
    expect(mocks.applyStripePaymentEvent).not.toHaveBeenCalled()
  })
})
