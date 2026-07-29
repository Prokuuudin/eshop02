import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'node:crypto'
import { createStripeClient } from '@/lib/stripe-client'
import { getOrderPaymentBySessionId, saveOrderPaymentStatus } from '@/lib/stripe-payment-store'
import { canAccessOrder, getServerOrderById, updateServerOrderPayment } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const VERIFY_IP_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 20 }
const VERIFY_SESSION_LIMIT = { windowMs: 5 * 60 * 1000, maxAttempts: 5 }
const STRIPE_SESSION_RE = /^cs_[A-Za-z0-9_]+$/

function getClientIp(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown'
}

function limitedResponse(resetAt: number) {
  return NextResponse.json({ error: 'rate_limited', resetAt }, {
    status: 429,
    headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not configured' }, { status: 500 })
    }

    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > 1024) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    }

    const { sessionId } = (await req.json()) as { sessionId?: string }

    if (typeof sessionId !== 'string' || sessionId.length < 8 || sessionId.length > 255 || !STRIPE_SESSION_RE.test(sessionId)) {
      return NextResponse.json({ error: 'invalid_session_id' }, { status: 400 })
    }

    const ip = getClientIp(req)
    const caller = await getServerUser()
    const sessionKey = createHash('sha256').update(sessionId).digest('hex')
    const limits = await Promise.all([
      checkRateLimit(`stripe-verify:ip:${ip}`, VERIFY_IP_LIMIT),
      checkRateLimit(`stripe-verify:checkout:${sessionKey}`, VERIFY_SESSION_LIMIT),
      ...(caller ? [checkRateLimit(`stripe-verify:user:${caller.id}`, VERIFY_IP_LIMIT)] : []),
    ])
    const limited = limits.find((result) => result.limited)
    if (limited) return limitedResponse(limited.resetAt)

    // Reject random Stripe ids before making a billable/external API request.
    const localPayment = await getOrderPaymentBySessionId(sessionId)
    if (!localPayment) {
      return NextResponse.json({ error: 'payment_session_not_found' }, { status: 404 })
    }
    const order = await getServerOrderById(localPayment.orderId)
    const guestBindingValid = !caller
      && !!order
      && !order.userId
      && !!order.email
      && !!localPayment.customerEmail
      && order.email.toLowerCase() === localPayment.customerEmail.toLowerCase()
    if (!order || (!canAccessOrder(order, caller) && !guestBindingValid)) {
      return NextResponse.json({ error: 'payment_session_not_found' }, { status: 404 })
    }

    const stripe = createStripeClient(secretKey)
    const session = await stripe.checkout.sessions.retrieve(sessionId)

    const paymentStatus = session.payment_status === 'paid' ? 'paid' : session.status === 'expired' ? 'failed' : 'pending'
    const orderId = session.metadata?.orderId

    if (session.id !== sessionId || orderId !== localPayment.orderId) {
      return NextResponse.json({ error: 'payment_session_mismatch' }, { status: 409 })
    }

    if (orderId) {
      const sessionEmail = session.customer_details?.email?.toLowerCase()

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
