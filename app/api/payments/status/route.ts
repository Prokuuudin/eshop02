import { NextRequest, NextResponse } from 'next/server'
import { getOrderPaymentStatus } from '@/lib/stripe-payment-store'
import { getServerOrderById } from '@/lib/orders-data-store'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const orderId = searchParams.get('orderId')?.trim()

    if (!orderId) {
      return NextResponse.json({ error: 'orderId is required' }, { status: 400 })
    }

    const [payment, serverOrder] = await Promise.all([
      getOrderPaymentStatus(orderId),
      getServerOrderById(orderId)
    ])

    return NextResponse.json({
      orderId,
      paymentStatus: serverOrder?.paymentStatus ?? payment?.paymentStatus,
      sessionId: serverOrder?.paymentSessionId ?? payment?.sessionId,
      paymentIntentId: payment?.paymentIntentId,
      updatedAt: payment?.updatedAt,
      source: serverOrder?.paymentStatus ? 'order' : 'stripe-store'
    })
  } catch (error) {
    console.error('Payment status GET error:', error)
    return NextResponse.json({ error: 'Failed to get payment status' }, { status: 500 })
  }
}
