import { NextRequest, NextResponse } from 'next/server'
import { createOrUpdateServerOrder, type ServerOrder } from '@/lib/orders-data-store'

export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  try {
    const { order } = (await req.json()) as { order?: ServerOrder }

    if (!order?.id) {
      return NextResponse.json({ error: 'order payload is required' }, { status: 400 })
    }

    const normalizedOrder: ServerOrder = {
      ...order,
      createdAt: order.createdAt || new Date().toISOString()
    }

    await createOrUpdateServerOrder(normalizedOrder)

    return NextResponse.json({ success: true, orderId: normalizedOrder.id })
  } catch (error) {
    console.error('Orders API POST error:', error)
    return NextResponse.json({ error: 'Failed to persist order' }, { status: 500 })
  }
}
