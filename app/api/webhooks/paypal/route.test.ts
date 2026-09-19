import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/paypal', () => ({ verifyPaypalWebhookSignature: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({ updateServerOrderPayment: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import { verifyPaypalWebhookSignature } from '@/lib/paypal'
import { updateServerOrderPayment } from '@/lib/orders-data-store'
import { POST } from './route'

function makeRequest(body: string, headerOverrides: Record<string, string | null> = {}): NextRequest {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'PAYPAL-TRANSMISSION-ID': 'tid-1',
    'PAYPAL-TRANSMISSION-TIME': '2026-09-19T00:00:00Z',
    'PAYPAL-CERT-URL': 'https://api.paypal.com/cert.pem',
    'PAYPAL-AUTH-ALGO': 'SHA256withRSA',
    'PAYPAL-TRANSMISSION-SIG': 'sig-1',
  }
  for (const [key, value] of Object.entries(headerOverrides)) {
    if (value === null) delete headers[key]
    else headers[key] = value
  }
  return new NextRequest('http://localhost/api/webhooks/paypal', { method: 'POST', body, headers })
}

const CAPTURE_EVENT = (status: string, customId = '1001') => JSON.stringify({
  event_type: 'PAYMENT.CAPTURE.COMPLETED',
  resource: { id: 'cap-1', status, custom_id: customId },
})

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/webhooks/paypal', () => {
  it('rejects an invalid signature with 401 and never touches the order', async () => {
    vi.mocked(verifyPaypalWebhookSignature).mockResolvedValue(false)

    const res = await POST(makeRequest(CAPTURE_EVENT('COMPLETED')))

    expect(res.status).toBe(401)
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
  })

  it('marks the order paid on a verified PAYMENT.CAPTURE.COMPLETED event', async () => {
    vi.mocked(verifyPaypalWebhookSignature).mockResolvedValue(true)

    const res = await POST(makeRequest(CAPTURE_EVENT('COMPLETED', '1001')))

    expect(res.status).toBe(200)
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentStatus: 'paid', paymentProvider: 'paypal' })
  })

  it('marks the order failed (releasing the stock hold) on a verified PAYMENT.CAPTURE.DENIED event', async () => {
    vi.mocked(verifyPaypalWebhookSignature).mockResolvedValue(true)
    const body = JSON.stringify({ event_type: 'PAYMENT.CAPTURE.DENIED', resource: { id: 'cap-1', custom_id: '1001' } })

    const res = await POST(makeRequest(body))

    expect(res.status).toBe(200)
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentStatus: 'failed', paymentProvider: 'paypal' })
  })

  it('acknowledges but ignores event types it does not act on', async () => {
    vi.mocked(verifyPaypalWebhookSignature).mockResolvedValue(true)
    const body = JSON.stringify({ event_type: 'CHECKOUT.ORDER.APPROVED', resource: { id: 'o-1' } })

    const res = await POST(makeRequest(body))

    expect(res.status).toBe(200)
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
  })

  it('acknowledges a capture event with no custom_id without touching an order', async () => {
    vi.mocked(verifyPaypalWebhookSignature).mockResolvedValue(true)
    const body = JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'cap-1' } })

    const res = await POST(makeRequest(body))

    expect(res.status).toBe(200)
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
  })

  it('returns 400 on unparsable JSON even with valid-looking headers', async () => {
    const res = await POST(makeRequest('not json'))

    expect(res.status).toBe(400)
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
  })

  it('returns 500 (retryable) when signature verification itself throws, e.g. missing config', async () => {
    vi.mocked(verifyPaypalWebhookSignature).mockRejectedValue(new Error('PAYPAL_WEBHOOK_ID must be configured'))

    const res = await POST(makeRequest(CAPTURE_EVENT('COMPLETED')))

    expect(res.status).toBe(500)
  })

  it('returns 500 (retryable) when the DB update throws', async () => {
    vi.mocked(verifyPaypalWebhookSignature).mockResolvedValue(true)
    vi.mocked(updateServerOrderPayment).mockRejectedValue(new Error('db down'))

    const res = await POST(makeRequest(CAPTURE_EVENT('COMPLETED')))

    expect(res.status).toBe(500)
  })
})
