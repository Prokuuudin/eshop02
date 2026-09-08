import { NextRequest, NextResponse } from 'next/server'
import { verifyPayseraWebhookSignature } from '@/lib/paysera'
import { updateServerOrderPayment } from '@/lib/orders-data-store'
import { logOperationalEvent } from '@/lib/observability'

export const runtime = 'nodejs'

type PayseraOrderWebhook = {
  event?: { type?: string; name?: string }
  order?: { merchant_order_id?: string; status?: string }
}

// Paysera Checkout Modern webhook: HMAC-SHA256(raw body, client secret) in X-Paysera-Signature.
// `paid` is auto-confirmed here (business decision 2026-09-07) — this replaces the old
// "always manual by staff" rule that applied only while no real gateway was integrated.
// updateServerOrderPayment is idempotent (paid is terminal, never downgraded), so duplicate
// deliveries are safe without extra dedup bookkeeping.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()
  const signature = req.headers.get('x-paysera-signature')

  let signatureValid: boolean
  try {
    signatureValid = verifyPayseraWebhookSignature(rawBody, signature)
  } catch (error) {
    logOperationalEvent({ event: 'paysera_webhook_config_error', level: 'error', alert: true }, error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  if (!signatureValid) {
    logOperationalEvent({ event: 'paysera_webhook_invalid_signature', level: 'warn', alert: true })
    // 401 tells Paysera to stop retrying — a bad signature will never become valid on retry.
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  let payload: PayseraOrderWebhook
  try {
    payload = JSON.parse(rawBody) as PayseraOrderWebhook
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  // Only the order-level event carries merchant_order_id; payment/refund events (thin envelope)
  // are acknowledged but not acted on in this integration.
  const orderId = payload.order?.merchant_order_id
  const status = payload.order?.status
  if (payload.event?.type !== 'order' || !orderId) {
    return NextResponse.json({ ok: true })
  }

  try {
    if (status === 'paid') {
      await updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'paysera' })
    } else if (status === 'canceled') {
      await updateServerOrderPayment(orderId, { paymentStatus: 'failed', paymentProvider: 'paysera' })
    }
  } catch (error) {
    logOperationalEvent({ event: 'paysera_webhook_update_failed', level: 'error', alert: true, orderId }, error)
    // 5xx — a transient DB error should be retried by Paysera.
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
