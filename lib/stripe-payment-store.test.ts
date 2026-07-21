import { describe, expect, it } from 'vitest'
import { canApplyStripePaymentTransition } from './stripe-payment-state'

const payment = (paymentStatus: 'pending' | 'paid' | 'failed', sessionId: string) => ({
  orderId: 'order-1',
  paymentStatus,
  sessionId,
  updatedAt: new Date().toISOString(),
})

describe('canApplyStripePaymentTransition', () => {
  it('never downgrades a paid order', () => {
    expect(canApplyStripePaymentTransition(payment('paid', 'cs_paid'), payment('failed', 'cs_stale'))).toBe(false)
    expect(canApplyStripePaymentTransition(payment('paid', 'cs_paid'), payment('pending', 'cs_other'))).toBe(false)
  })

  it('ignores a failure from a stale duplicate session', () => {
    expect(canApplyStripePaymentTransition(payment('pending', 'cs_active'), payment('failed', 'cs_stale'))).toBe(false)
  })

  it('allows a successful payment from a legacy duplicate session to win', () => {
    expect(canApplyStripePaymentTransition(payment('pending', 'cs_active'), payment('paid', 'cs_legacy'))).toBe(true)
  })
})
