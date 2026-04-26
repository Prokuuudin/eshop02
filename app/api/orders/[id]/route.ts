import { NextRequest, NextResponse } from 'next/server'
import { getServerOrderById, updateServerOrderPayment } from '@/lib/orders-data-store'

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

    return NextResponse.json({ order })
  } catch (error) {
    console.error('Orders API GET by id error:', error)
    return NextResponse.json({ error: 'Failed to read order' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  try {
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
