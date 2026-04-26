import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { saveOrderPaymentStatus } from '@/lib/stripe-payment-store'
import { updateServerOrderPayment } from '@/lib/orders-data-store'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not configured' }, { status: 500 })
    }

    const stripe = new Stripe(secretKey)
    const { sessionId } = (await req.json()) as { sessionId?: string }

    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })
    }

    const session = await stripe.checkout.sessions.retrieve(sessionId)

    const paymentStatus = session.payment_status === 'paid' ? 'paid' : session.status === 'expired' ? 'failed' : 'pending'
    const orderId = session.metadata?.orderId

    if (orderId) {
      await saveOrderPaymentStatus({
        orderId,
        paymentStatus,
        sessionId: session.id,
        paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
        customerEmail: session.customer_details?.email ?? undefined
      })

      await updateServerOrderPayment(orderId, {
        paymentStatus,
        paymentProvider: 'stripe',
        paymentSessionId: session.id
      })
    }

    return NextResponse.json({
      sessionId: session.id,
      status: session.status,
      paymentStatus,
      orderId
    })
  } catch (error) {
    console.error('Stripe verify session error:', error)
    return NextResponse.json({ error: 'Failed to verify payment session' }, { status: 500 })
  }
}
