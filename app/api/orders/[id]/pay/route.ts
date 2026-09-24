import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { canAccessOrder, getServerOrderById, updateServerOrderPayment } from '@/lib/orders-data-store'
import { getServerUser } from '@/lib/server-auth'
import { createPayseraPaymentForOrder } from '@/lib/paysera'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

type Context = {
  params: Promise<{ id: string }>
}

// "Retry payment" for an order that was never paid — used when the order page's Paysera
// link is missing (the idempotent-duplicate-submit fallback couldn't mint one) or the
// customer just wants another shot at an expired/abandoned payment link.
export async function POST(_req: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const order = await getServerOrderById(id)
    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Same ownership rule as GET /api/orders/[id] — 404 (not 403) so existence isn't leaked.
    const caller = await getServerUser()
    if (!canAccessOrder(order, caller)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Keep the PayPal integration intact, but do not let customers mint new PayPal links
    // while that payment method is disabled.
    if (order.paymentMethod === 'paypal') {
      return NextResponse.json({ error: 'payment_method_unavailable' }, { status: 400 })
    }
    if (order.paymentMethod !== 'paysera') {
      return NextResponse.json({ error: 'not_online_payment' }, { status: 400 })
    }
    if (order.paymentStatus === 'paid') {
      return NextResponse.json({ error: 'already_paid' }, { status: 409 })
    }

    const limited = await checkRateLimit(`order-pay-retry:${id}`, { windowMs: 60 * 60 * 1000, maxAttempts: 10 })
    if (limited.limited) {
      return NextResponse.json({ error: 'rate_limited' }, {
        status: 429,
        headers: { 'Retry-After': String(Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))) },
      })
    }

    const payment = await createPayseraPaymentForOrder(order)
    await updateServerOrderPayment(order.id, { paymentSessionId: payment.payseraOrderId })

    return NextResponse.json({ paymentUrl: payment.paymentUrl })
  } catch (error) {
    logApiError('Orders API pay-retry error:', error)
    return NextResponse.json({ error: 'payment_gateway_error' }, { status: 502 })
  }
}
