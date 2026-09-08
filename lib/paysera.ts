import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getSiteUrl } from './site-url'

// Paysera Checkout Modern (REST/OAuth2). Docs: https://developers.paysera.com/guides/checkout-modern
const TOKEN_URL = 'https://api.paysera.com/auth/realms/Paysera/protocol/openid-connect/token'
const ORDERS_URL = 'https://api.paysera.com/merchant-order/integration/v1/orders'
const PAYMENT_LINKS_URL = 'https://api.paysera.com/checkout-payment-link/integration/v1/payment-links'

export class PayseraConfigurationError extends Error {
  constructor() {
    super('PAYSERA_CLIENT_ID, PAYSERA_CLIENT_SECRET and PAYSERA_PROJECT_ID must be configured')
    this.name = 'PayseraConfigurationError'
  }
}

function credentials(): { clientId: string; clientSecret: string; projectId: string } {
  const clientId = process.env.PAYSERA_CLIENT_ID?.trim()
  const clientSecret = process.env.PAYSERA_CLIENT_SECRET?.trim()
  const projectId = process.env.PAYSERA_PROJECT_ID?.trim()
  if (!clientId || !clientSecret || !projectId) throw new PayseraConfigurationError()
  return { clientId, clientSecret, projectId }
}

// Module-level cache: one Paysera project per deployment, so a single shared token is fine.
let cachedToken: { value: string; expiresAt: number } | null = null

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.value

  const { clientId, clientSecret } = credentials()
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: clientId,
    client_secret: clientSecret,
  })
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!response.ok) {
    throw new Error(`Paysera token request failed: ${response.status} ${await response.text().catch(() => '')}`)
  }
  const data = (await response.json()) as { access_token: string; expires_in: number }
  // Refresh 5 min before real expiry (Paysera tokens live 3600s, no refresh token).
  cachedToken = { value: data.access_token, expiresAt: Date.now() + Math.max(0, data.expires_in - 300) * 1000 }
  return cachedToken.value
}

export type PayseraPayment = { payseraOrderId: string; paymentUrl: string }

export async function createPayseraPayment(params: {
  orderReference: string
  amountCents: number
  currency: string
  successUrl: string
  failureUrl: string
  callbackUrl: string
  language?: string
}): Promise<PayseraPayment> {
  const token = await getAccessToken()
  const authHeaders = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

  const orderResponse = await fetch(ORDERS_URL, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      purchase: {
        reference: params.orderReference,
        amount: params.amountCents,
        currency: params.currency,
      },
      redirect_urls: {
        success_url: params.successUrl,
        failure_url: params.failureUrl,
        callback_url: params.callbackUrl,
      },
    }),
  })
  if (!orderResponse.ok) {
    throw new Error(`Paysera order create failed: ${orderResponse.status} ${await orderResponse.text().catch(() => '')}`)
  }
  const order = (await orderResponse.json()) as { order_id: string }

  const linkResponse = await fetch(PAYMENT_LINKS_URL, {
    method: 'POST',
    headers: authHeaders,
    body: JSON.stringify({
      order_id: order.order_id,
      name: `Order ${params.orderReference}`,
      lifetime: 3600,
      purchase: { amount: params.amountCents },
      experience: { language: params.language ?? 'lv' },
    }),
  })
  if (!linkResponse.ok) {
    throw new Error(`Paysera payment link create failed: ${linkResponse.status} ${await linkResponse.text().catch(() => '')}`)
  }
  const link = (await linkResponse.json()) as { payment_URL: string }

  return { payseraOrderId: order.order_id, paymentUrl: link.payment_URL }
}

/**
 * Builds the redirect/callback URLs and mints a Paysera payment for one of our orders.
 * Shared by the checkout submit path, the idempotent-duplicate-submit fallback, and the
 * customer-facing "retry payment" endpoint — each needs a *fresh* link, never a cached one.
 */
export async function createPayseraPaymentForOrder(order: { id: string; total: number; language?: string }): Promise<PayseraPayment> {
  const lang = order.language === 'en' || order.language === 'lv' ? order.language : 'ru'
  const siteUrl = getSiteUrl()
  return createPayseraPayment({
    orderReference: order.id,
    amountCents: Math.round(order.total * 100),
    currency: 'EUR',
    successUrl: `${siteUrl}/${lang}/order/${order.id}?payment=success`,
    failureUrl: `${siteUrl}/${lang}/order/${order.id}?payment=failed`,
    callbackUrl: `${siteUrl}/api/webhooks/paysera`,
    language: lang,
  })
}

/**
 * Verifies the `X-Paysera-Signature` header: hex HMAC-SHA256 of the raw request body,
 * keyed with the OAuth client secret. Must run against the raw (unparsed) body string.
 */
export function verifyPayseraWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader?.trim()) return false
  const { clientSecret } = credentials()
  const expectedHex = createHmac('sha256', clientSecret).update(rawBody, 'utf8').digest('hex')
  const expected = Buffer.from(expectedHex, 'utf8')
  const provided = Buffer.from(signatureHeader.trim(), 'utf8')
  if (expected.length !== provided.length) return false
  return timingSafeEqual(expected, provided)
}
