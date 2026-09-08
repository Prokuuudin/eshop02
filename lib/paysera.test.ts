import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHmac } from 'node:crypto'

vi.mock('server-only', () => ({}))

import { verifyPayseraWebhookSignature, PayseraConfigurationError } from './paysera'

beforeEach(() => {
  vi.stubEnv('PAYSERA_PROJECT_ID', 'project-1')
  vi.stubEnv('PAYSERA_CLIENT_ID', 'client-1')
  vi.stubEnv('PAYSERA_CLIENT_SECRET', 'top-secret')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('verifyPayseraWebhookSignature', () => {
  it('accepts a signature that matches HMAC-SHA256(rawBody, client secret)', () => {
    const rawBody = '{"event":{"type":"order"},"order":{"merchant_order_id":"1001","status":"paid"}}'
    const signature = createHmac('sha256', 'top-secret').update(rawBody, 'utf8').digest('hex')
    expect(verifyPayseraWebhookSignature(rawBody, signature)).toBe(true)
  })

  it('rejects a signature computed with the wrong secret', () => {
    const rawBody = '{"order":{"status":"paid"}}'
    const wrongSignature = createHmac('sha256', 'not-the-secret').update(rawBody, 'utf8').digest('hex')
    expect(verifyPayseraWebhookSignature(rawBody, wrongSignature)).toBe(false)
  })

  it('rejects a signature for a body that was tampered with after signing', () => {
    const signedBody = '{"order":{"merchant_order_id":"1001","status":"paid"}}'
    const tamperedBody = '{"order":{"merchant_order_id":"1001","status":"canceled"}}'
    const signature = createHmac('sha256', 'top-secret').update(signedBody, 'utf8').digest('hex')
    expect(verifyPayseraWebhookSignature(tamperedBody, signature)).toBe(false)
  })

  it('rejects a missing or empty signature header', () => {
    expect(verifyPayseraWebhookSignature('{}', null)).toBe(false)
    expect(verifyPayseraWebhookSignature('{}', '')).toBe(false)
    expect(verifyPayseraWebhookSignature('{}', '   ')).toBe(false)
  })

  it('throws PayseraConfigurationError when credentials are not configured', () => {
    vi.stubEnv('PAYSERA_CLIENT_SECRET', '')
    expect(() => verifyPayseraWebhookSignature('{}', 'anything')).toThrow(PayseraConfigurationError)
  })
})

describe('createPayseraPayment', () => {
  // The access-token cache is module-level state, so each test needs a fresh module
  // instance — otherwise a token cached by one test leaks into the next.
  async function freshPaysera(): Promise<typeof import('./paysera')> {
    vi.resetModules()
    return import('./paysera')
  }

  it('exchanges credentials for a token, creates the order, then the payment link', async () => {
    const { createPayseraPayment } = await freshPaysera()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ order_id: 'pay-order-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ payment_URL: 'https://bank.paysera.com/pay/xyz' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createPayseraPayment({
      orderReference: '1001',
      amountCents: 6400,
      currency: 'EUR',
      successUrl: 'https://shop.example/order/1001?payment=success',
      failureUrl: 'https://shop.example/order/1001?payment=failed',
      callbackUrl: 'https://shop.example/api/webhooks/paysera',
    })

    expect(result).toEqual({ payseraOrderId: 'pay-order-1', paymentUrl: 'https://bank.paysera.com/pay/xyz' })
    expect(fetchMock).toHaveBeenCalledTimes(3)

    const tokenCall = fetchMock.mock.calls[0]
    expect(tokenCall[0]).toBe('https://api.paysera.com/auth/realms/Paysera/protocol/openid-connect/token')
    expect(String(tokenCall[1]?.body)).toContain('client_secret=top-secret')

    const orderCall = fetchMock.mock.calls[1]
    expect(orderCall[0]).toBe('https://api.paysera.com/merchant-order/integration/v1/orders')
    const orderBody = JSON.parse(String(orderCall[1]?.body))
    expect(orderBody.purchase).toEqual({ reference: '1001', amount: 6400, currency: 'EUR' })
    expect((orderCall[1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')

    const linkCall = fetchMock.mock.calls[2]
    expect(linkCall[0]).toBe('https://api.paysera.com/checkout-payment-link/integration/v1/payment-links')
    const linkBody = JSON.parse(String(linkCall[1]?.body))
    expect(linkBody.order_id).toBe('pay-order-1')
  })

  it('reuses a cached token across calls instead of re-authenticating', async () => {
    const { createPayseraPayment } = await freshPaysera()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ order_id: 'pay-order-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ payment_URL: 'https://bank.paysera.com/pay/1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ order_id: 'pay-order-2' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ payment_URL: 'https://bank.paysera.com/pay/2' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await createPayseraPayment({
      orderReference: '1001', amountCents: 100, currency: 'EUR',
      successUrl: 's', failureUrl: 'f', callbackUrl: 'c',
    })
    await createPayseraPayment({
      orderReference: '1002', amountCents: 200, currency: 'EUR',
      successUrl: 's', failureUrl: 'f', callbackUrl: 'c',
    })

    // 5 calls total (not 6): the second createPayseraPayment reused the cached token.
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })

  it('throws when the order-create request fails', async () => {
    const { createPayseraPayment } = await freshPaysera()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('bad request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createPayseraPayment({
      orderReference: '1001', amountCents: 100, currency: 'EUR',
      successUrl: 's', failureUrl: 'f', callbackUrl: 'c',
    })).rejects.toThrow(/Paysera order create failed/)
  })

  it('throws PayseraConfigurationError when credentials are missing', async () => {
    const { createPayseraPayment, PayseraConfigurationError: FreshConfigError } = await freshPaysera()
    vi.stubEnv('PAYSERA_CLIENT_ID', '')
    await expect(createPayseraPayment({
      orderReference: '1001', amountCents: 100, currency: 'EUR',
      successUrl: 's', failureUrl: 'f', callbackUrl: 'c',
    })).rejects.toThrow(FreshConfigError)
  })
})
