import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/paypal', () => ({ capturePaypalOrder: vi.fn() }))
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

describe('GET /api/orders/paypal-return', () => {
  it('captures the approved order and redirects to the order page with payment=success', async () => {
    vi.mocked(capturePaypalOrder).mockResolvedValue({ status: 'COMPLETED' })

    const res = await GET(makeRequest('?orderId=1001&lang=en&token=paypal-order-1&PayerID=payer-1'))

    expect(capturePaypalOrder).toHaveBeenCalledWith('paypal-order-1')
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://shop.example/en/order/1001?payment=success')
  })

  it('defaults to ru when lang is missing or not one of ru/en/lv', async () => {
    vi.mocked(capturePaypalOrder).mockResolvedValue({ status: 'COMPLETED' })

    const res = await GET(makeRequest('?orderId=1001&lang=fr&token=paypal-order-1'))

    expect(res.headers.get('location')).toBe('https://shop.example/ru/order/1001?payment=success')
  })

  it('redirects to payment=failed when the capture call throws (expired/already-captured/etc.)', async () => {
    vi.mocked(capturePaypalOrder).mockRejectedValue(new Error('PayPal order capture failed: 422'))

    const res = await GET(makeRequest('?orderId=1001&lang=ru&token=paypal-order-1'))

    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe('https://shop.example/ru/order/1001?payment=failed')
  })

  it('returns 400 without calling PayPal when orderId is missing', async () => {
    const res = await GET(makeRequest('?lang=ru&token=paypal-order-1'))

    expect(res.status).toBe(400)
    expect(capturePaypalOrder).not.toHaveBeenCalled()
  })

  it('returns 400 without calling PayPal when token is missing', async () => {
    const res = await GET(makeRequest('?orderId=1001&lang=ru'))

    expect(res.status).toBe(400)
    expect(capturePaypalOrder).not.toHaveBeenCalled()
  })
})
