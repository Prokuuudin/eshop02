import { NextRequest, NextResponse } from 'next/server'
import { getServerOrderById, updateServerOrderPayment } from '@/lib/orders-data-store'
import { getServerUser, requireAdmin } from '@/lib/server-auth'

export const runtime = 'nodejs'

type Context = {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, context: Context) {
  try {
    const { id } = await context.params
    const order = await getServerOrderById(id)

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Order ids are sequential — never expose another customer's order (PII / IDOR).
    // Only the admin or the order's owner may read it. New orders are bound by userId;
    // legacy orders (no userId) fall back to an email match. Return 404 to others so
    // existence isn't leaked.
    const caller = await getServerUser()
    const isAdmin = caller?.platformRole === 'admin'
    const isOwnerById = !!caller && !!order.userId && order.userId === caller.id
    const isOwnerByEmail =
      !order.userId &&
      !!caller?.email &&
      !!order.email &&
      caller.email.toLowerCase() === order.email.toLowerCase()
    if (!isAdmin && !isOwnerById && !isOwnerByEmail) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ order })
  } catch (error) {
    console.error('Orders API GET by id error:', error)
    return NextResponse.json({ error: 'Failed to read order' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  try {
    // Payment status is set authoritatively by the Stripe webhook/verify endpoints.
    // Any manual override here is admin-only — clients must never set paymentStatus directly.
    const gate = await requireAdmin()
    if (gate instanceof NextResponse) return gate

    const { id } = await context.params
    const body = (await req.json()) as {
      paymentStatus?: 'unpaid' | 'pending' | 'paid' | 'failed'
      paymentProvider?: 'stripe' | 'manual'
      paymentSessionId?: string
    }

    const updated = await updateServerOrderPayment(id, {
      paymentStatus: body.paymentStatus,
      paymentProvider: body.paymentProvider,
      paymentSessionId: body.paymentSessionId
    })

    if (!updated) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ success: true, order: updated })
  } catch (error) {
    console.error('Orders API PATCH by id error:', error)
    return NextResponse.json({ error: 'Failed to update order payment' }, { status: 500 })
  }
}
