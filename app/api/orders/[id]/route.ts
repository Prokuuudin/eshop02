import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { canAccessOrder, getServerOrderById, updateServerOrderPayment } from '@/lib/orders-data-store'
import { getServerUser, requireAdmin } from '@/lib/server-auth'

export const runtime = 'nodejs'

type Context = {
  params: Promise<{ id: string }>
}

export async function GET(_req: NextRequest, context: Context): Promise<NextResponse> {
  try {
    const { id } = await context.params
    const order = await getServerOrderById(id)

    if (!order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Order ids are sequential נnever expose another customer's order (PII / IDOR).
    // Return 404 (not 403) to others so existence isn't leaked.
    const caller = await getServerUser()
    if (!canAccessOrder(order, caller)) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    return NextResponse.json({ order })
  } catch (error) {
    logApiError("Orders API GET by id error:", error)
    return NextResponse.json({ error: 'Failed to read order' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: Context): Promise<NextResponse> {
  try {
    // Payment status is set authoritatively by the Stripe webhook/verify endpoints.
    // Any manual override here is admin-only נclients must never set paymentStatus directly.
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
    logApiError("Orders API PATCH by id error:", error)
    return NextResponse.json({ error: 'Failed to update order payment' }, { status: 500 })
  }
}





