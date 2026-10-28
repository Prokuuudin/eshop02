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

// Release 2026-10-20: PayPal is disabled and its webhook must never change an order,
// whatever the payload, signature or event type.
describe('POST /api/webhooks/paypal (disabled for this release)', () => {
  it.each([
    ['verified capture completed', CAPTURE_EVENT('COMPLETED'), true],
    ['verified capture denied', JSON.stringify({ event_type: 'PAYMENT.CAPTURE.DENIED', resource: { id: 'cap-1', custom_id: '1001' } }), true],
    ['invalid signature', CAPTURE_EVENT('COMPLETED'), false],
    ['capture without custom_id', JSON.stringify({ event_type: 'PAYMENT.CAPTURE.COMPLETED', resource: { id: 'cap-1' } }), true],
    ['unparsable JSON', '{not json', true],
  ])('returns retryable 503 and never touches an order: %s', async (_name, body, signatureValid) => {
    vi.mocked(verifyPaypalWebhookSignature).mockResolvedValue(signatureValid as boolean)
    const res = await POST(makeRequest(body as string))
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'paypal_disabled' })
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
    expect(verifyPaypalWebhookSignature).not.toHaveBeenCalled()
  })
})
