import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/paypal', () => ({ capturePaypalOrder: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: () => { throw new Error('order or session access') } }) }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://shop.example' }))

import { capturePaypalOrder } from '@/lib/paypal'
import { GET } from './route'

function makeRequest(query: string): NextRequest {
  return new NextRequest(`http://localhost/api/orders/paypal-return${query}`)
}

beforeEach(() => {
  vi.clearAllMocks()
})

// Release 2026-10-20: PayPal is disabled; the return URL must never capture money.
describe('GET /api/orders/paypal-return (disabled for this release)', () => {
  it.each([
    ['approved order with payer', '?orderId=1001&lang=en&token=paypal-order-1&PayerID=payer-1'],
    ['unknown language', '?orderId=1001&lang=fr&token=paypal-order-1'],
    ['missing orderId', '?lang=ru&token=paypal-order-1'],
    ['missing token', '?orderId=1001&lang=ru'],
    ['no parameters', ''],
  ])('fails closed with 503 and never calls PayPal: %s', async (_name, query) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch')
    vi.mocked(capturePaypalOrder).mockResolvedValue({ status: 'COMPLETED' })

    const res = await GET(makeRequest(query))

    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ error: 'paypal_disabled' })
    expect(res.headers.get('location')).toBeNull()
    expect(capturePaypalOrder).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
    fetchSpy.mockRestore()
  })
})
