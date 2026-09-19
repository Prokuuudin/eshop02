import 'server-only'
import { getSiteUrl } from './site-url'

// PayPal Orders v2 (REST, no SDK). Docs: https://developer.paypal.com/docs/api/orders/v2/
// Webhook verification: https://developer.paypal.com/docs/api/webhooks/v1/#verify-webhook-signature_post

export class PaypalConfigurationError extends Error {
  constructor() {
    super('PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and PAYPAL_API_BASE must be configured')
    this.name = 'PaypalConfigurationError'
  }
}

function credentials(): { clientId: string; clientSecret: string; apiBase: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID?.trim()
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET?.trim()
  const apiBase = process.env.PAYPAL_API_BASE?.trim()
  if (!clientId || !clientSecret || !apiBase) throw new PaypalConfigurationError()
  return { clientId, clientSecret, apiBase: apiBase.endsWith('/') ? apiBase.slice(0, -1) : apiBase }
}

// Module-level cache: one PayPal app per deployment, so a single shared token is fine.
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<{ token: string; apiBase: string }> {
  const { clientId, clientSecret, apiBase } = credentials()
  if (cachedToken && cachedToken.expiresAt > Date.now()) return { token: cachedToken.value, apiBase }

  const response = await fetch(`${apiBase}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  })
  if (!response.ok) {
    throw new Error(`PayPal token request failed: ${response.status} ${await response.text().catch(() => '')}`)
  }
  const data = (await response.json()) as { access_token: string; expires_in: number }
  // Refresh 5 min before real expiry, same margin as the Paysera client.
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Math.max(0, data.expires_in - 300) * 1000 }
  return { token: cachedToken.value, apiBase }
}

// Formats integer cents as PayPal's decimal amount string (e.g. 6400 -> "64.00") without
// floating-point division, so money never passes through float arithmetic.
function centsToAmountValue(amountCents: number): string {
  const cents = Math.round(amountCents)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const whole = Math.trunc(abs / 100)
  const fraction = String(abs % 100).padStart(2, '0')
  return `${sign}${whole}.${fraction}`
}

export type PaypalPayment = { paypalOrderId: string; paymentUrl: string }

export async function createPaypalPayment(params: {
  orderReference: string
  amountCents: number
  currency: string
  returnUrl: string
  cancelUrl: string
  locale?: string
}): Promise<PaypalPayment> {
  const { token, apiBase } = await getAccessToken()

  const response = await fetch(`${apiBase}/v2/checkout/orders`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        // custom_id (not invoice_id) carries our order id — invoice_id must stay unique for the
        // lifetime of the PayPal account, which a retried/re-minted payment link would violate.
        reference_id: params.orderReference,
        custom_id: params.orderReference,
        amount: { currency_code: params.currency, value: centsToAmountValue(params.amountCents) },
      }],
      payment_source: {
        paypal: {
          experience_context: {
            return_url: params.returnUrl,
            cancel_url: params.cancelUrl,
            user_action: 'PAY_NOW',
            shipping_preference: 'NO_SHIPPING',
            ...(params.locale ? { locale: params.locale } : {}),
          },
        },
      },
    }),
  })
  if (!response.ok) {
    throw new Error(`PayPal order create failed: ${response.status} ${await response.text().catch(() => '')}`)
  }
  const order = (await response.json()) as { id: string; links?: Array<{ rel: string; href: string }> }
  const approveLink = order.links?.find((link) => link.rel === 'approve' || link.rel === 'payer-action')?.href
  if (!approveLink) throw new Error('PayPal order create response missing approve link')

  return { paypalOrderId: order.id, paymentUrl: approveLink }
}

/**
 * Finalizes payment for an order the customer already approved on PayPal's hosted page.
 * PayPal only takes the money on capture (unlike Paysera, which settles before redirecting
 * back) — this must run when the customer lands back on returnUrl, before we know it worked.
 * The webhook (PAYMENT.CAPTURE.COMPLETED) remains the source of truth for marking an order paid.
 */
export async function capturePaypalOrder(paypalOrderId: string): Promise<{ status: string }> {
  const { token, apiBase } = await getAccessToken()
  const response = await fetch(`${apiBase}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  })
  if (!response.ok) {
    throw new Error(`PayPal order capture failed: ${response.status} ${await response.text().catch(() => '')}`)
  }
  const data = (await response.json()) as { status: string }
  return { status: data.status }
}

/**
 * Builds the return/cancel URLs and mints a PayPal order for one of our orders. Shared by the
 * checkout submit path and the customer-facing "retry payment" endpoint, each needing a fresh order.
 */
export async function createPaypalPaymentForOrder(order: { id: string; total: number; language?: string }): Promise<PaypalPayment> {
  const lang = order.language === 'en' || order.language === 'lv' ? order.language : 'ru'
  const siteUrl = getSiteUrl()
  return createPaypalPayment({
    orderReference: order.id,
    amountCents: Math.round(order.total * 100),
    currency: 'EUR',
    returnUrl: `${siteUrl}/api/orders/paypal-return?orderId=${order.id}&lang=${lang}`,
    cancelUrl: `${siteUrl}/${lang}/order/${order.id}?payment=failed`,
    locale: lang === 'ru' ? 'ru-RU' : lang === 'lv' ? 'lv-LV' : 'en-US',
  })
}

/**
 * Verifies a webhook delivery via PayPal's verify-webhook-signature API (not a local HMAC check
 * like Paysera's — PayPal signs with a rotating cert and requires calling back to verify it).
 */
export async function verifyPaypalWebhookSignature(params: {
  transmissionId: string | null
  transmissionTime: string | null
  certUrl: string | null
  authAlgo: string | null
  transmissionSig: string | null
  webhookEvent: unknown
}): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID?.trim()
  if (!webhookId) throw new PaypalConfigurationError()
  if (!params.transmissionId || !params.transmissionTime || !params.certUrl || !params.authAlgo || !params.transmissionSig) {
    return false
  }

  const { token, apiBase } = await getAccessToken()
  const response = await fetch(`${apiBase}/v1/notifications/verify-webhook-signature`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      auth_algo: params.authAlgo,
      cert_url: params.certUrl,
      transmission_id: params.transmissionId,
      transmission_sig: params.transmissionSig,
      transmission_time: params.transmissionTime,
      webhook_id: webhookId,
      webhook_event: params.webhookEvent,
    }),
  })
  if (!response.ok) {
    throw new Error(`PayPal webhook verification request failed: ${response.status} ${await response.text().catch(() => '')}`)
  }
  const data = (await response.json()) as { verification_status?: string }
  return data.verification_status === 'SUCCESS'
}
