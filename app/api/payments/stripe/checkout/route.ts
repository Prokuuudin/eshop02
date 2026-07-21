import { NextRequest, NextResponse } from 'next/server'
import { createStripeClient } from '@/lib/stripe-client'
import { getOrderPaymentStatus, saveOrderPaymentStatus } from '@/lib/stripe-payment-store'
import { canAccessOrder, getServerOrderById, type ServerOrder } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'
import { getSiteUrl } from '@/lib/site-url'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

const toCents = (amount: number) => Math.max(0, Math.round(amount * 100))

/**
 * Build Stripe line items strictly from the order stored server-side (never from client input),
 * scaled so their sum always equals order.total exactly in cents. Each product line uses
 * quantity: 1 with the per-line total baked into unit_amount — that (rather than unit price *
 * Stripe quantity) is what makes an exact-cent proration of discount/bonus/delivery possible,
 * since Stripe's own quantity multiplier can't be scaled to an arbitrary integer-cent target.
 */
function buildLineItems(order: ServerOrder) {
  const targetTotalCents = toCents(order.total)
  const deliveryCents = Math.min(toCents(order.delivery), targetTotalCents)
  const itemsTargetCents = targetTotalCents - deliveryCents

  const rawLines = order.items
    .filter((item) => item.quantity > 0 && item.price > 0)
    .map((item) => ({ item, cents: toCents(item.price) * item.quantity }))
  const rawSum = rawLines.reduce((sum, line) => sum + line.cents, 0)

  let scaledLines: { item: ServerOrder['items'][number]; cents: number }[] = []
  if (rawSum > 0 && itemsTargetCents > 0) {
    let allocated = 0
    scaledLines = rawLines.map((line) => {
      const cents = Math.floor((line.cents * itemsTargetCents) / rawSum)
      allocated += cents
      return { item: line.item, cents }
    })
    let remainder = itemsTargetCents - allocated
    const byDescendingCents = [...scaledLines].sort((a, b) => b.cents - a.cents)
    for (let i = 0; i < byDescendingCents.length && remainder > 0; i += 1) {
      byDescendingCents[i].cents += 1
      remainder -= 1
    }
  }

  const lineItems = scaledLines
    .filter((line) => line.cents > 0)
    .map((line) => ({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: line.cents,
        product_data: {
          name: line.item.quantity > 1 ? `${line.item.title} × ${line.item.quantity}` : line.item.title,
        },
      },
    }))

  if (deliveryCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'eur',
        unit_amount: deliveryCents,
        product_data: { name: 'Delivery' },
      },
    })
  }

  return { lineItems, targetTotalCents }
}

export async function POST(req: NextRequest) {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  try {
    const secretKey = process.env.STRIPE_SECRET_KEY
    if (!secretKey) {
      return NextResponse.json({ error: 'STRIPE_SECRET_KEY is not configured' }, { status: 500 })
    }

    const stripe = createStripeClient(secretKey)
    const body = await req.json()

    const { orderId, email } = body as { orderId?: string; email?: string }

    if (!orderId) {
      return NextResponse.json({ error: 'Invalid checkout payload' }, { status: 400 })
    }

    // Order ids are sequential — never let a caller start a Stripe session for
    // someone else's order (that session's completion would flip that order to
    // "paid"). Logged-in callers must own the order; guest (no-account) orders
    // require the same email the order was placed under.
    const order = await getServerOrderById(orderId)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }
    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'Order is already paid' }, { status: 409 })
    }
    if (order.stockReservationStatus === 'released') {
      return NextResponse.json({ error: 'Stock reservation expired' }, { status: 409 })
    }
    const caller = await getServerUser()
    const ownsAsGuest = !caller && !order.userId && !!email && !!order.email && email.trim().toLowerCase() === order.email.toLowerCase()
    if (!canAccessOrder(order, caller) && !ownsAsGuest) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Keep one active Checkout Session per order. Reusing the existing URL avoids
    // conflicting expiry webhooks and prevents customers being charged twice.
    const existingPayment = await getOrderPaymentStatus(orderId)
    if (existingPayment?.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'Order is already paid' }, { status: 409 })
    }
    if (existingPayment?.paymentStatus === 'pending' && existingPayment.sessionId) {
      const existingSession = await stripe.checkout.sessions.retrieve(existingPayment.sessionId)
      if (existingSession.status === 'open' && existingSession.url) {
        return NextResponse.json({
          url: existingSession.url,
          sessionId: existingSession.id,
          amountExpected: existingSession.amount_total,
          reused: true,
        })
      }
    }

    // Authoritative amount: built from the order stored server-side, never from client-supplied
    // items/qty/total. This is the only value that determines what Stripe actually charges.
    const { lineItems, targetTotalCents } = buildLineItems(order)

    if (lineItems.length === 0 || targetTotalCents <= 0) {
      return NextResponse.json({ error: 'Order requires no online payment' }, { status: 400 })
    }

    const baseUrl = getSiteUrl()

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      customer_email: email || order.email,
      line_items: lineItems,
      metadata: {
        orderId
      },
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${baseUrl}/order/${orderId}?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/order/${orderId}?payment=cancelled`
    }, {
      // Concurrent retries observing the same previous binding resolve to one
      // Stripe session. Once that session expires its id becomes the next key seed.
      idempotencyKey: `order-checkout-${orderId}-${existingPayment?.sessionId ?? 'initial'}`,
    })

    await saveOrderPaymentStatus({
      orderId,
      paymentStatus: 'pending',
      sessionId: session.id,
      paymentIntentId: typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
      customerEmail: email || order.email,
      replaceSession: true,
    })

    return NextResponse.json({
      url: session.url,
      sessionId: session.id,
      amountExpected: targetTotalCents
    })
  } catch (error) {
    console.error('Stripe checkout session error:', error)
    return NextResponse.json({ error: 'Failed to initialize payment session' }, { status: 500 })
  }
}
