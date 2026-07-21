export type StripePaymentTransition = {
  paymentStatus: 'pending' | 'paid' | 'failed'
  sessionId?: string
}

/**
 * Stripe events are delivered out of order and an order may have legacy duplicate
 * Checkout Sessions. Paid is terminal, and only the currently bound session may
 * move an order to a non-paid state. A successful payment from any session wins.
 */
export function canApplyStripePaymentTransition(
  current: StripePaymentTransition | undefined,
  next: StripePaymentTransition,
): boolean {
  if (!current) return true
  if (current.paymentStatus === 'paid') return next.paymentStatus === 'paid'
  if (next.paymentStatus === 'paid') return true
  return !current.sessionId || !next.sessionId || current.sessionId === next.sessionId
}
