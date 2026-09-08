import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/paysera', () => ({ verifyPayseraWebhookSignature: vi.fn() }))
vi.mock('@/lib/orders-data-store', () => ({ updateServerOrderPayment: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import { verifyPayseraWebhookSignature } from '@/lib/paysera'
import { updateServerOrderPayment } from '@/lib/orders-data-store'
import { POST } from './route'

function makeRequest(body: string, signature: string | null = 'sig'): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (signature !== null) headers['X-Paysera-Signature'] = signature
  return new NextRequest('http://localhost/api/webhooks/paysera', { method: 'POST', body, headers })
}

const ORDER_EVENT = (status: string) =>
  JSON.stringify({ event: { type: 'order', name: 'amount_paid_updated' }, order: { merchant_order_id: '1001', status } })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('POST /api/webhooks/paysera', () => {
  it('rejects an invalid signature with 401 and never touches the order', async () => {
    vi.mocked(verifyPayseraWebhookSignature).mockReturnValue(false)

    const res = await POST(makeRequest(ORDER_EVENT('paid')))

    expect(res.status).toBe(401)
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
  })

  it('marks the order paid on a verified "paid" order event', async () => {
    vi.mocked(verifyPayseraWebhookSignature).mockReturnValue(true)

    const res = await POST(makeRequest(ORDER_EVENT('paid')))

    expect(res.status).toBe(200)
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentStatus: 'paid', paymentProvider: 'paysera' })
  })

  it('marks the order failed (releasing the stock hold) on a verified "canceled" order event', async () => {
    vi.mocked(verifyPayseraWebhookSignature).mockReturnValue(true)

    const res = await POST(makeRequest(ORDER_EVENT('canceled')))

    expect(res.status).toBe(200)
    expect(updateServerOrderPayment).toHaveBeenCalledWith('1001', { paymentStatus: 'failed', paymentProvider: 'paysera' })
  })

  it('acknowledges but ignores non-order events (thin payment/refund envelopes)', async () => {
    vi.mocked(verifyPayseraWebhookSignature).mockReturnValue(true)
    const body = JSON.stringify({ event: { type: 'payment', name: 'status_updated' }, payment: { id: 'p-1', status: 'settled' } })

    const res = await POST(makeRequest(body))

    expect(res.status).toBe(200)
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
  })

  it('returns 400 on unparsable JSON even with a valid signature', async () => {
    vi.mocked(verifyPayseraWebhookSignature).mockReturnValue(true)

    const res = await POST(makeRequest('not json'))

    expect(res.status).toBe(400)
    expect(updateServerOrderPayment).not.toHaveBeenCalled()
  })

  it('returns 500 (retryable) when the signature check itself throws, e.g. missing config', async () => {
    vi.mocked(verifyPayseraWebhookSignature).mockImplementation(() => {
      throw new Error('PAYSERA_CLIENT_SECRET must be configured')
    })

    const res = await POST(makeRequest(ORDER_EVENT('paid')))

    expect(res.status).toBe(500)
  })

  it('returns 500 (retryable) when the DB update throws', async () => {
    vi.mocked(verifyPayseraWebhookSignature).mockReturnValue(true)
    vi.mocked(updateServerOrderPayment).mockRejectedValue(new Error('db down'))

    const res = await POST(makeRequest(ORDER_EVENT('paid')))

    expect(res.status).toBe(500)
  })
})
