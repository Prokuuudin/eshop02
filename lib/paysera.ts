import 'server-only'
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import { getSiteUrl } from './site-url'

// Paysera Checkout Modern (REST/OAuth2). Docs: https://developers.paysera.com/guides/checkout-modern
const TOKEN_URL = 'https://api.paysera.com/auth/realms/Paysera/protocol/openid-connect/token'
const ORDERS_URL = 'https://api.paysera.com/merchant-order/integration/v1/orders'
const PAYMENT_LINKS_URL = 'https://api.paysera.com/checkout-payment-link/integration/v1/payment-links'

type PayseraOrderState = {
  id: string
  reference: string
  amount: number
  amount_paid: number
  currency: string
  status: string
}

type PayseraPaymentLinkState = {
  order_id: string
  amount: number
  currency: string
  status: string
  expired_at: number
  link?: { url?: string }
}

export type PayseraPaidEvidence = {
  sessionId: string
  amount: number
  amountPaid: number
  currency: string
}

export class PayseraOrderNotRetryableError extends Error {
  constructor(public readonly status: string) {
    super('paysera_order_not_retryable')
    this.name = 'PayseraOrderNotRetryableError'
  }
}

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

export type PayseraPayment = {
  payseraOrderId: string
  paymentUrl?: string
  paidEvidence?: PayseraPaidEvidence
  order?: import('./orders-data-types').ServerOrder
}

async function payseraHeaders(): Promise<Record<string, string>> {
  return { Authorization: `Bearer ${await getAccessToken()}`, 'Content-Type': 'application/json' }
}

const PAYMENT_LINK_NAME_MAX_LENGTH = 255

function paymentLinkName(orderReference: string, unique: boolean): string {
  const prefix = `Order ${orderReference}`
  if (!unique) return prefix.slice(0, PAYMENT_LINK_NAME_MAX_LENGTH)
  const suffix = ` retry-${randomUUID()}`
  return `${prefix.slice(0, PAYMENT_LINK_NAME_MAX_LENGTH - suffix.length)}${suffix}`
}

function payseraErrorCode(responseText: string): string | undefined {
  try {
    return (JSON.parse(responseText) as { error?: string }).error
  } catch {
    return undefined
  }
}

async function createPaymentLink(params: {
  payseraOrderId: string
  orderReference: string
  amountCents: number
  language?: string
  lifetime?: number
  uniqueName?: boolean
}): Promise<PayseraPayment> {
  const headers = await payseraHeaders()
  const send = (name: string): Promise<Response> => fetch(PAYMENT_LINKS_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      order_id: params.payseraOrderId,
      name,
      lifetime: params.lifetime ?? 3600,
      purchase: { amount: params.amountCents },
      experience: { language: params.language ?? 'lv' },
    }),
  })

  let response = await send(paymentLinkName(params.orderReference, params.uniqueName ?? false))
  if (!response.ok) {
    const responseText = await response.text().catch(() => '')
    if (response.status === 409 && payseraErrorCode(responseText) === 'validation_duplicate_name') {
      // A previous expired/canceled link keeps its name. Retry once with a fresh name,
      // always on the same Paysera order; never create or replace the provider order.
      response = await send(paymentLinkName(params.orderReference, true))
      if (!response.ok) {
        throw new Error(`Paysera payment link create failed: ${response.status} ${await response.text().catch(() => '')}`)
      }
    } else {
      throw new Error(`Paysera payment link create failed: ${response.status} ${responseText}`)
    }
  }
  const link = (await response.json()) as { payment_URL: string }
  return { payseraOrderId: params.payseraOrderId, paymentUrl: link.payment_URL }
}

export async function createPayseraPayment(params: {
  orderReference: string
  amountCents: number
  currency: string
  successUrl: string
  failureUrl: string
  callbackUrl: string
  language?: string
  lifetime?: number
}): Promise<PayseraPayment> {
  const orderResponse = await fetch(ORDERS_URL, {
    method: 'POST',
    headers: await payseraHeaders(),
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
  return createPaymentLink({
    payseraOrderId: order.order_id,
    orderReference: params.orderReference,
    amountCents: params.amountCents,
    language: params.language,
    lifetime: params.lifetime,
  })
}

async function readPayseraOrder(payseraOrderId: string): Promise<PayseraOrderState> {
  const response = await fetch(`${ORDERS_URL}/${encodeURIComponent(payseraOrderId)}`, {
    method: 'GET',
    headers: await payseraHeaders(),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Paysera order read failed: ${response.status} ${await response.text().catch(() => '')}`)
  }
  return (await response.json()) as PayseraOrderState
}

async function findActivePaymentLink(payseraOrderId: string, amountCents: number, currency: string): Promise<string | null> {
  const params = new URLSearchParams({ order_id: payseraOrderId, status: 'active', size: '10', order_direction: 'desc' })
  const response = await fetch(`${PAYMENT_LINKS_URL}?${params.toString()}`, {
    method: 'GET',
    headers: await payseraHeaders(),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Paysera payment link read failed: ${response.status} ${await response.text().catch(() => '')}`)
  }
  const data = (await response.json()) as { items?: PayseraPaymentLinkState[] }
  const nowSeconds = Math.floor(Date.now() / 1000)
  const active = data.items?.find((link) => link.order_id === payseraOrderId
    && link.status === 'active'
    && link.amount === amountCents
    && link.currency === currency
    && link.expired_at > nowSeconds
    && Boolean(link.link?.url))
  return active?.link?.url ?? null
}

async function findPayseraOrderByReference(orderId: string, amountCents: number): Promise<PayseraOrderState | null> {
  const params = new URLSearchParams({ q: orderId, size: '100', include_total_count: 'true' })
  const response = await fetch(`${ORDERS_URL}?${params.toString()}`, {
    method: 'GET',
    headers: await payseraHeaders(),
    cache: 'no-store',
  })
  if (!response.ok) {
    throw new Error(`Paysera order search failed: ${response.status} ${await response.text().catch(() => '')}`)
  }
  const data = (await response.json()) as { items?: PayseraOrderState[] }
  const exact = (data.items ?? []).filter((order) => order.reference === orderId)
  if (exact.length > 1) throw new Error('paysera_order_reference_ambiguous')
  const found = exact[0]
  if (!found) return null
  if (found.amount !== amountCents || found.currency !== 'EUR') throw new Error('paysera_order_mismatch')
  return found
}

function assertPayseraOrderMatches(order: PayseraOrderState, expected: { sessionId: string; orderId: string; total: number }): void {
  if (order.id !== expected.sessionId
    || order.reference !== expected.orderId
    || order.amount !== Math.round(expected.total * 100)
    || order.currency !== 'EUR') {
    throw new Error('paysera_order_mismatch')
  }
}

export async function resolvePayseraPaymentForOrder(order: {
  id: string
  total: number
  language?: string
  paymentSessionId?: string
  stockReservedUntil?: string
}): Promise<PayseraPayment> {
  const lang = order.language === 'en' || order.language === 'lv' ? order.language : 'ru'
  const lifetime = order.stockReservedUntil
    ? Math.max(1, Math.min(3600, Math.floor((new Date(order.stockReservedUntil).getTime() - Date.now()) / 1000)))
    : 3600

  const discovered = order.paymentSessionId
    ? await readPayseraOrder(order.paymentSessionId)
    : await findPayseraOrderByReference(order.id, Math.round(order.total * 100))

  if (discovered) {
    const payseraOrder = discovered
    assertPayseraOrderMatches(payseraOrder, {
      sessionId: order.paymentSessionId ?? payseraOrder.id,
      orderId: order.id,
      total: order.total,
    })
    if (payseraOrder.status === 'paid') {
      return {
        payseraOrderId: payseraOrder.id,
        paidEvidence: {
          sessionId: payseraOrder.id,
          amount: payseraOrder.amount,
          amountPaid: payseraOrder.amount_paid,
          currency: payseraOrder.currency,
        },
      }
    }
    if (payseraOrder.status !== 'pending_payment') {
      throw new PayseraOrderNotRetryableError(payseraOrder.status)
    }

    const activeUrl = await findActivePaymentLink(payseraOrder.id, payseraOrder.amount, payseraOrder.currency)
    if (activeUrl) return { payseraOrderId: payseraOrder.id, paymentUrl: activeUrl }
    return createPaymentLink({
      payseraOrderId: payseraOrder.id,
      orderReference: order.id,
      amountCents: payseraOrder.amount,
      language: lang,
      lifetime,
      uniqueName: true,
    })
  }

  const siteUrl = getSiteUrl()
  return createPayseraPayment({
    orderReference: order.id,
    amountCents: Math.round(order.total * 100),
    currency: 'EUR',
    lifetime,
    successUrl: `${siteUrl}/${lang}/order/${order.id}?payment=success`,
    failureUrl: `${siteUrl}/${lang}/order/${order.id}?payment=failed`,
    callbackUrl: `${siteUrl}/api/webhooks/paysera`,
    language: lang,
  })
}

/**
 * Resolves one local order to a single Paysera order. Existing active links are reused;
 * an expired link may be replaced, but an in-flight Paysera order is never replaced.
 * Shared by checkout idempotency and the customer-facing retry endpoint.
 */
export async function createPayseraPaymentForOrder(order: { id: string; total: number; language?: string }): Promise<PayseraPayment> {
  const { createOrderPaymentSession } = await import('./orders-data-store')
  return createOrderPaymentSession(order.id, resolvePayseraPaymentForOrder)
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
