import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createStripeClient } from '@/lib/stripe-client'
import { applyStripePaymentEvent } from '@/lib/stripe-payment-store'
import { getServerOrderById } from '@/lib/orders-data-store'
import { getCorrelationId, logOperationalEvent } from '@/lib/observability'

export const runtime = 'nodejs'

/**
 * Defense against a checkout session being completed for less than the order actually costs
 * (e.g. the order's price changed after the session link was issued, or amount tampering).
 * Returns true only when the session paid exactly what the order requires, in EUR.
 */
async function sessionMatchesOrderAmount(orderId: string, session: Stripe.Checkout.Session): Promise<boolean> {
  const order = await getServerOrderById(orderId)
  if (!order) return false

  const expectedCents = Math.round(order.total * 100)
  const currencyOk = (session.currency ?? '').toLowerCase() === 'eur'
  const amountOk = session.amount_total === expectedCents

  if (!currencyOk || !amountOk) return false

  return true
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const correlationId = getCorrelationId(req)
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    if (!secretKey || !webhookSecret) {
      return NextResponse.json({ error: 'Stripe secrets are not configured' }, { status: 500 })
    }

    const stripe = createStripeClient(secretKey)
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      logOperationalEvent({ event: 'stripe_webhook_signature_missing', level: 'warn', alert: true, correlationId })
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }

    const rawBody = await req.text()
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.orderId

      if (orderId) {
        // `completed` describes the Checkout UI lifecycle, not necessarily a
        // settled payment (notably for asynchronous payment methods). Only
        // Stripe's authoritative paid state may settle the order.
        if (session.payment_status !== 'paid') {
          logOperationalEvent({
            event: 'stripe_checkout_completed_unpaid',
            level: 'warn',
            alert: true,
            correlationId,
            orderId,
            sessionId: session.id,
            paymentStatus: session.payment_status,
          })
          return NextResponse.json({ received: true, paymentPending: true })
        }

        if (!(await sessionMatchesOrderAmount(orderId, session))) {
          logOperationalEvent({
            event: 'stripe_webhook_amount_mismatch',
            level: 'error',
            alert: true,
            correlationId,
            orderId,
            sessionId: session.id,
          })
          return NextResponse.json({ received: true, amountMismatch: true })
        }

        const applied = await applyStripePaymentEvent({
          orderId,
          paymentStatus: 'paid',
          sessionId: session.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
          customerEmail: session.customer_details?.email ?? undefined,
          eventId: event.id
        })

        if (!applied) return NextResponse.json({ received: true, idempotent: true })
        logOperationalEvent({ event: 'stripe_payment_applied', correlationId, orderId, sessionId: session.id, stripeEventId: event.id })
      }
    }

    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.orderId

      if (orderId) {
        const applied = await applyStripePaymentEvent({
          orderId,
          paymentStatus: 'failed',
          sessionId: session.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
          customerEmail: session.customer_details?.email ?? undefined,
          eventId: event.id
        })

        if (!applied) return NextResponse.json({ received: true, idempotent: true })
        logOperationalEvent({ event: 'stripe_payment_failed', level: 'warn', alert: true, correlationId, orderId, sessionId: session.id, stripeEventId: event.id })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    logOperationalEvent({ event: 'stripe_webhook_failed', level: 'error', alert: true, correlationId }, error)
    return NextResponse.json({ error: 'Invalid Stripe webhook payload' }, { status: 400 })
  }
}
