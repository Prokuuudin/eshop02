import { NextRequest, NextResponse } from 'next/server'
import { verifyPaypalWebhookSignature } from '@/lib/paypal'
import { updateServerOrderPayment } from '@/lib/orders-data-store'
import { logOperationalEvent } from '@/lib/observability'

export const runtime = 'nodejs'

type PaypalCaptureWebhook = {
  event_type?: string
  resource?: { id?: string; custom_id?: string }
}

// PayPal webhook: verified via the verify-webhook-signature API (see lib/paypal.ts), not a
// local HMAC like Paysera's. custom_id on the capture resource carries our own order id
// (set at order creation) — PayPal's own order/capture ids are opaque to us otherwise.
// `paid` is auto-confirmed on a verified PAYMENT.CAPTURE.COMPLETED (business decision
// 2026-09-19, same as Paysera). updateServerOrderPayment is idempotent (paid is terminal),
// so duplicate deliveries are safe without extra dedup bookkeeping.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()

  let payload: PaypalCaptureWebhook
  try {
    payload = JSON.parse(rawBody) as PaypalCaptureWebhook
  } catch {
    return NextResponse.json({ error: 'invalid_payload' }, { status: 400 })
  }

  let signatureValid: boolean
  try {
    signatureValid = await verifyPaypalWebhookSignature({
      transmissionId: req.headers.get('paypal-transmission-id'),
      transmissionTime: req.headers.get('paypal-transmission-time'),
      certUrl: req.headers.get('paypal-cert-url'),
      authAlgo: req.headers.get('paypal-auth-algo'),
      transmissionSig: req.headers.get('paypal-transmission-sig'),
      webhookEvent: payload,
    })
  } catch (error) {
    logOperationalEvent({ event: 'paypal_webhook_config_error', level: 'error', alert: true }, error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
  if (!signatureValid) {
    logOperationalEvent({ event: 'paypal_webhook_invalid_signature', level: 'warn', alert: true })
    return NextResponse.json({ error: 'invalid_signature' }, { status: 401 })
  }

  const orderId = payload.resource?.custom_id
  const eventType = payload.event_type
  if (!orderId || (eventType !== 'PAYMENT.CAPTURE.COMPLETED' && eventType !== 'PAYMENT.CAPTURE.DENIED')) {
    return NextResponse.json({ ok: true })
  }

  try {
    if (eventType === 'PAYMENT.CAPTURE.COMPLETED') {
      await updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'paypal' })
    } else {
      await updateServerOrderPayment(orderId, { paymentStatus: 'failed', paymentProvider: 'paypal' })
    }
  } catch (error) {
    logOperationalEvent({ event: 'paypal_webhook_update_failed', level: 'error', alert: true, orderId }, error)
    // 5xx — a transient DB error should be retried by PayPal.
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
