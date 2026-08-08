import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/stripe-client', () => ({ createStripeClient: vi.fn() }))
vi.mock('@/lib/stripe-payment-store', () => ({ applyStripePaymentEvent: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({ getServerOrderById: vi.fn() }))
vi.mock('@/lib/observability', () => ({
  getCorrelationId: () => 'webhook-test-1234',
  logOperationalEvent: vi.fn(),
}))

import { createStripeClient } from '@/lib/stripe-client'
import { applyStripePaymentEvent } from '@/lib/stripe-payment-store'
import { getServerOrderById } from '@/lib/orders-data-store'
import { logOperationalEvent } from '@/lib/observability'
import { POST } from './route'

const constructEvent = vi.fn()

const request = () => new NextRequest('https://shop.test/api/payments/stripe/webhook', {
  method: 'POST',
  headers: { 'stripe-signature': 'valid-signature' },
  body: '{}',
})

beforeEach(() => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = 'sk_test_secret'
  process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret'
  vi.mocked(createStripeClient).mockReturnValue({ webhooks: { constructEvent } } as never)
})

describe('POST /api/payments/stripe/webhook', () => {
  it('does not settle a completed Checkout Session until Stripe says it is paid', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_unpaid',
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_unpaid', payment_status: 'unpaid', amount_total: 1000, currency: 'eur',
        metadata: { orderId: 'o1' },
      } },
    })

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ received: true, paymentPending: true })
    expect(getServerOrderById).not.toHaveBeenCalled()
    expect(applyStripePaymentEvent).not.toHaveBeenCalled()
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'stripe_checkout_completed_unpaid', alert: true, orderId: 'o1',
    }))
  })

  it('applies a paid event only when its amount and currency match the order', async () => {
    constructEvent.mockReturnValue({
      id: 'evt_paid',
      type: 'checkout.session.completed',
      data: { object: {
        id: 'cs_paid', payment_status: 'paid', amount_total: 1000, currency: 'eur',
        metadata: { orderId: 'o1' }, payment_intent: 'pi_1',
      } },
    })
    vi.mocked(getServerOrderById).mockResolvedValue({ id: 'o1', total: 10 } as never)
    vi.mocked(applyStripePaymentEvent).mockResolvedValue(true)

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(applyStripePaymentEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventId: 'evt_paid', orderId: 'o1', paymentStatus: 'paid', sessionId: 'cs_paid',
    }))
  })
})
