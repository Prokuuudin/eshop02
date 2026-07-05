import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { saveOrderPaymentStatus } from '@/lib/stripe-payment-store'
import { canAccessOrder, getServerOrderById, updateServerOrderPayment } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'

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
      const order = await getServerOrderById(orderId)
      const sessionEmail = session.customer_details?.email?.toLowerCase()
      const caller = await getServerUser()

      // A Stripe session can only update the order it was actually created for.
      // Accept the logged-in owner/admin, or (for guest orders) the person who
      // actually paid on Stripe's own checkout page — never an arbitrary caller
      // who merely knows/guesses the sequential orderId.
      const canWrite =
        !!order &&
        (canAccessOrder(order, caller) ||
          (!order.userId && !!order.email && !!sessionEmail && order.email.toLowerCase() === sessionEmail))

      if (canWrite) {
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
      } else {
        console.warn('Stripe verify: refused to update order not owned by caller/session', { orderId })
      }
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
