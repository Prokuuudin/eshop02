import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

beforeEach(() => {
  vi.stubEnv('PAYPAL_CLIENT_ID', 'client-1')
  vi.stubEnv('PAYPAL_CLIENT_SECRET', 'top-secret')
  vi.stubEnv('PAYPAL_API_BASE', 'https://api-m.sandbox.paypal.com')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('createPaypalPayment', () => {
  // The access-token cache is module-level state, so each test needs a fresh module
  // instance — otherwise a token cached by one test leaks into the next.
  async function freshPaypal(): Promise<typeof import('./paypal')> {
    vi.resetModules()
    return import('./paypal')
  }

  it('exchanges credentials for a token, then creates the order with an amount in decimal string form', async () => {
    const { createPaypalPayment } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: 'paypal-order-1',
        links: [
          { rel: 'self', href: 'https://api-m.sandbox.paypal.com/v2/checkout/orders/paypal-order-1' },
          { rel: 'approve', href: 'https://www.sandbox.paypal.com/checkoutnow?token=paypal-order-1' },
        ],
      }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await createPaypalPayment({
      orderReference: '1001',
      amountCents: 6400,
      currency: 'EUR',
      returnUrl: 'https://shop.example/api/orders/paypal-return?orderId=1001',
      cancelUrl: 'https://shop.example/ru/order/1001?payment=failed',
    })

    expect(result).toEqual({ paypalOrderId: 'paypal-order-1', paymentUrl: 'https://www.sandbox.paypal.com/checkoutnow?token=paypal-order-1' })
    expect(fetchMock).toHaveBeenCalledTimes(2)

    const tokenCall = fetchMock.mock.calls[0]
    expect(tokenCall[0]).toBe('https://api-m.sandbox.paypal.com/v1/oauth2/token')
    expect((tokenCall[1]?.headers as Record<string, string>).Authorization).toBe(`Basic ${Buffer.from('client-1:top-secret').toString('base64')}`)

    const orderCall = fetchMock.mock.calls[1]
    expect(orderCall[0]).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders')
    expect((orderCall[1]?.headers as Record<string, string>).Authorization).toBe('Bearer tok-1')
    const orderBody = JSON.parse(String(orderCall[1]?.body))
    expect(orderBody.intent).toBe('CAPTURE')
    expect(orderBody.purchase_units).toEqual([
      { reference_id: '1001', custom_id: '1001', amount: { currency_code: 'EUR', value: '64.00' } },
    ])
    expect(orderBody.payment_source.paypal.experience_context.return_url).toBe('https://shop.example/api/orders/paypal-return?orderId=1001')
    expect(orderBody.payment_source.paypal.experience_context.cancel_url).toBe('https://shop.example/ru/order/1001?payment=failed')
  })

  it('formats amounts under one euro without floating-point rounding artifacts', async () => {
    const { createPaypalPayment } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'o1', links: [{ rel: 'approve', href: 'https://x' }] }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await createPaypalPayment({
      orderReference: '1002', amountCents: 5, currency: 'EUR', returnUrl: 'r', cancelUrl: 'c',
    })

    const orderBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body))
    expect(orderBody.purchase_units[0].amount.value).toBe('0.05')
  })

  it('reuses a cached token across calls instead of re-authenticating', async () => {
    const { createPaypalPayment } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'o1', links: [{ rel: 'approve', href: 'https://x/1' }] }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'o2', links: [{ rel: 'approve', href: 'https://x/2' }] }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await createPaypalPayment({ orderReference: '1001', amountCents: 100, currency: 'EUR', returnUrl: 'r', cancelUrl: 'c' })
    await createPaypalPayment({ orderReference: '1002', amountCents: 200, currency: 'EUR', returnUrl: 'r', cancelUrl: 'c' })

    // 3 calls total (not 4): the second createPaypalPayment reused the cached token.
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('throws when the order-create request fails', async () => {
    const { createPaypalPayment } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('bad request', { status: 400 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createPaypalPayment({
      orderReference: '1001', amountCents: 100, currency: 'EUR', returnUrl: 'r', cancelUrl: 'c',
    })).rejects.toThrow(/PayPal order create failed/)
  })

  it('throws when the create-order response has no approve link', async () => {
    const { createPaypalPayment } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'o1', links: [{ rel: 'self', href: 'https://x' }] }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(createPaypalPayment({
      orderReference: '1001', amountCents: 100, currency: 'EUR', returnUrl: 'r', cancelUrl: 'c',
    })).rejects.toThrow(/missing approve link/)
  })

  it('throws PaypalConfigurationError when credentials are missing', async () => {
    const { createPaypalPayment, PaypalConfigurationError: FreshConfigError } = await freshPaypal()
    vi.stubEnv('PAYPAL_CLIENT_ID', '')
    await expect(createPaypalPayment({
      orderReference: '1001', amountCents: 100, currency: 'EUR', returnUrl: 'r', cancelUrl: 'c',
    })).rejects.toThrow(FreshConfigError)
  })
})

describe('capturePaypalOrder', () => {
  async function freshPaypal(): Promise<typeof import('./paypal')> {
    vi.resetModules()
    return import('./paypal')
  }

  it('captures an approved order and returns its status', async () => {
    const { capturePaypalOrder } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'paypal-order-1', status: 'COMPLETED' }), { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await capturePaypalOrder('paypal-order-1')

    expect(result).toEqual({ status: 'COMPLETED' })
    const captureCall = fetchMock.mock.calls[1]
    expect(captureCall[0]).toBe('https://api-m.sandbox.paypal.com/v2/checkout/orders/paypal-order-1/capture')
    expect(captureCall[1]?.method).toBe('POST')
  })

  it('throws when the capture request fails', async () => {
    const { capturePaypalOrder } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response('order already captured', { status: 422 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(capturePaypalOrder('paypal-order-1')).rejects.toThrow(/PayPal order capture failed/)
  })
})

describe('verifyPaypalWebhookSignature', () => {
  async function freshPaypal(): Promise<typeof import('./paypal')> {
    vi.resetModules()
    return import('./paypal')
  }

  const HEADERS = {
    transmissionId: 'tid-1',
    transmissionTime: '2026-09-19T00:00:00Z',
    certUrl: 'https://api.paypal.com/cert.pem',
    authAlgo: 'SHA256withRSA',
    transmissionSig: 'sig-1',
    webhookEvent: { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' },
  }

  it('calls the verify-webhook-signature endpoint with the transmission headers and configured webhook id', async () => {
    vi.stubEnv('PAYPAL_WEBHOOK_ID', 'wh-1')
    const { verifyPaypalWebhookSignature } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: 'SUCCESS' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyPaypalWebhookSignature(HEADERS)

    expect(result).toBe(true)
    const verifyCall = fetchMock.mock.calls[1]
    expect(verifyCall[0]).toBe('https://api-m.sandbox.paypal.com/v1/notifications/verify-webhook-signature')
    const body = JSON.parse(String(verifyCall[1]?.body))
    expect(body).toEqual({
      auth_algo: 'SHA256withRSA',
      cert_url: 'https://api.paypal.com/cert.pem',
      transmission_id: 'tid-1',
      transmission_sig: 'sig-1',
      transmission_time: '2026-09-19T00:00:00Z',
      webhook_id: 'wh-1',
      webhook_event: { id: 'WH-1', event_type: 'PAYMENT.CAPTURE.COMPLETED' },
    })
  })

  it('returns false when PayPal reports verification failure', async () => {
    vi.stubEnv('PAYPAL_WEBHOOK_ID', 'wh-1')
    const { verifyPaypalWebhookSignature } = await freshPaypal()
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'tok-1', expires_in: 3600 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ verification_status: 'FAILURE' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await verifyPaypalWebhookSignature(HEADERS)).toBe(false)
  })

  it('returns false without calling PayPal when a transmission header is missing', async () => {
    vi.stubEnv('PAYPAL_WEBHOOK_ID', 'wh-1')
    const { verifyPaypalWebhookSignature } = await freshPaypal()
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const result = await verifyPaypalWebhookSignature({ ...HEADERS, transmissionSig: null })

    expect(result).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('throws PaypalConfigurationError when PAYPAL_WEBHOOK_ID is not configured', async () => {
    vi.stubEnv('PAYPAL_WEBHOOK_ID', '')
    const { verifyPaypalWebhookSignature, PaypalConfigurationError: FreshConfigError } = await freshPaypal()
    await expect(verifyPaypalWebhookSignature(HEADERS)).rejects.toThrow(FreshConfigError)
  })
})
