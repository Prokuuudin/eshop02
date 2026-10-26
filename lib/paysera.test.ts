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

  it('reports an existing paid Paysera session for local reconciliation without creating anything', async () => {
    const { resolvePayseraPaymentForOrder } = await freshPaysera()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'session-1', reference: '1001', amount: 100, amount_paid: 100, currency: 'EUR', status: 'paid',
      }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(resolvePayseraPaymentForOrder({
      id: '1001', total: 1, language: 'ru', paymentSessionId: 'session-1',
    })).resolves.toMatchObject({
      payseraOrderId: 'session-1',
      paidEvidence: { sessionId: 'session-1', amount: 100, amountPaid: 100, currency: 'EUR' },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.some(([url, init]) => url === 'https://api.paysera.com/merchant-order/integration/v1/orders'
      && (init as RequestInit | undefined)?.method === 'POST')).toBe(false)
  })

  it('reuses the active link after a failed payment attempt instead of creating a second order', async () => {
    const { resolvePayseraPaymentForOrder } = await freshPaysera()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'session-1', reference: '1001', amount: 100, amount_paid: 0, currency: 'EUR', status: 'pending_payment',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{
        order_id: 'session-1', amount: 100, currency: 'EUR', status: 'active',
        expired_at: Math.floor(Date.now() / 1000) + 3600,
        link: { url: 'https://bank.paysera.com/pay/existing' },
      }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolvePayseraPaymentForOrder({
      id: '1001', total: 1, language: 'ru', paymentSessionId: 'session-1',
    })

    expect(result).toEqual({ payseraOrderId: 'session-1', paymentUrl: 'https://bank.paysera.com/pay/existing' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls.filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')).toHaveLength(1)
  })

  it('creates only a new link on the same pending Paysera order when the prior link expired', async () => {
    const { resolvePayseraPaymentForOrder } = await freshPaysera()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'session-1', reference: '1001', amount: 100, amount_paid: 0, currency: 'EUR', status: 'pending_payment',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ payment_URL: 'https://bank.paysera.com/pay/retry' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolvePayseraPaymentForOrder({
      id: '1001', total: 1, language: 'ru', paymentSessionId: 'session-1',
    })

    expect(result.payseraOrderId).toBe('session-1')
    const mutationUrls = fetchMock.mock.calls
      .filter(([, init]) => (init as RequestInit | undefined)?.method === 'POST')
      .map(([url]) => url)
    expect(mutationUrls).toEqual([
      'https://api.paysera.com/auth/realms/Paysera/protocol/openid-connect/token',
      'https://api.paysera.com/checkout-payment-link/integration/v1/payment-links',
    ])
  })

  it('adopts an orphaned pending Paysera order by reference after a partial first-session failure', async () => {
    const { resolvePayseraPaymentForOrder } = await freshPaysera()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{
        id: 'orphan-session', reference: '1001', amount: 100, amount_paid: 0, currency: 'EUR', status: 'pending_payment',
      }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{
        order_id: 'orphan-session', amount: 100, currency: 'EUR', status: 'active',
        expired_at: Math.floor(Date.now() / 1000) + 3600,
        link: { url: 'https://bank.paysera.com/pay/orphan' },
      }] }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await resolvePayseraPaymentForOrder({ id: '1001', total: 1, language: 'ru' })

    expect(result).toEqual({ payseraOrderId: 'orphan-session', paymentUrl: 'https://bank.paysera.com/pay/orphan' })
    expect(fetchMock.mock.calls.some(([url, init]) => url === 'https://api.paysera.com/merchant-order/integration/v1/orders'
      && (init as RequestInit | undefined)?.method === 'POST')).toBe(false)
  })
})
