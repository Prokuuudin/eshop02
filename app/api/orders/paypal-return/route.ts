import { NextRequest, NextResponse } from 'next/server'
import { capturePaypalOrder } from '@/lib/paypal'
import { getSiteUrl } from '@/lib/site-url'
import { logOperationalEvent } from '@/lib/observability'

export const runtime = 'nodejs'

const LANGUAGES = ['ru', 'en', 'lv'] as const

/**
 * Where PayPal sends the customer back after they approve payment on PayPal's hosted page.
 * PayPal only takes the money once we call capture (unlike Paysera, which settles before
 * redirecting) — this route triggers that capture, then bounces the customer to the order
 * page. The webhook (PAYMENT.CAPTURE.COMPLETED), not this redirect, is what marks an order
 * paid — a customer closing the tab before this loads must not leave the charge unrecorded.
 */
// Release 2026-10-20: PayPal stays disabled. Fail closed before reading any parameter so
// no request can reach the PayPal API (capture takes real money) or touch an order or
// payment session. Unconditional on purpose: there is no flag that could re-open it.
const PAYPAL_RETURN_CAPTURE_ENABLED: boolean = false

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (!PAYPAL_RETURN_CAPTURE_ENABLED) {
    logOperationalEvent({ event: 'paypal_return_ignored_disabled', level: 'warn' })
    return NextResponse.json({ error: 'paypal_disabled' }, { status: 503 })
  }
  const params = req.nextUrl.searchParams
  const orderId = params.get('orderId')
  const paypalOrderId = params.get('token')
  const langParam = params.get('lang')
  const lang = (LANGUAGES as readonly string[]).includes(langParam ?? '') ? langParam! : 'ru'

  if (!orderId || !paypalOrderId) {
    return NextResponse.json({ error: 'missing_params' }, { status: 400 })
  }

  const siteUrl = getSiteUrl()
  const orderPageUrl = (outcome: 'success' | 'failed'): string =>
    `${siteUrl}/${lang}/order/${encodeURIComponent(orderId)}?payment=${outcome}`

  try {
    await capturePaypalOrder(paypalOrderId)
    return NextResponse.redirect(orderPageUrl('success'), 302)
  } catch (error) {
    logOperationalEvent({
      event: 'paypal_capture_failed', level: 'error', alert: true, orderId,
    }, error)
    return NextResponse.redirect(orderPageUrl('failed'), 302)
  }
}
