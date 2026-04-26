import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { isStripeEventProcessed, saveOrderPaymentStatus } from '@/lib/stripe-payment-store'
import { updateServerOrderPayment } from '@/lib/orders-data-store'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET

    if (!secretKey || !webhookSecret) {
      return NextResponse.json({ error: 'Stripe secrets are not configured' }, { status: 500 })
    }

    const stripe = new Stripe(secretKey)
    const signature = req.headers.get('stripe-signature')

    if (!signature) {
      return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 })
    }

    const rawBody = await req.text()
    const event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret)

    const alreadyProcessed = await isStripeEventProcessed(event.id)
    if (alreadyProcessed) {
      return NextResponse.json({ received: true, idempotent: true })
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.orderId

      if (orderId) {
        await saveOrderPaymentStatus({
          orderId,
          paymentStatus: 'paid',
          sessionId: session.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
          customerEmail: session.customer_details?.email ?? undefined,
          eventId: event.id
        })

        await updateServerOrderPayment(orderId, {
          paymentStatus: 'paid',
          paymentProvider: 'stripe',
          paymentSessionId: session.id
        })
      }
    }

    if (event.type === 'checkout.session.expired' || event.type === 'checkout.session.async_payment_failed') {
      const session = event.data.object as Stripe.Checkout.Session
      const orderId = session.metadata?.orderId

      if (orderId) {
        await saveOrderPaymentStatus({
          orderId,
          paymentStatus: 'failed',
          sessionId: session.id,
          paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
          customerEmail: session.customer_details?.email ?? undefined,
          eventId: event.id
        })

        await updateServerOrderPayment(orderId, {
          paymentStatus: 'failed',
          paymentProvider: 'stripe',
          paymentSessionId: session.id
        })
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Stripe webhook error:', error)
    return NextResponse.json({ error: 'Invalid Stripe webhook payload' }, { status: 400 })
  }
}
