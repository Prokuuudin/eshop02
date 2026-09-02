import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { WebhookEndpoint } from './webhooks-store'

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  saveLog: vi.fn(),
  activeEndpoints: vi.fn(),
}))

vi.mock('node:dns/promises', () => ({ default: { lookup: mocks.lookup } }))
vi.mock('@/lib/webhooks-store', () => ({
  getActiveEndpointsForEvent: mocks.activeEndpoints,
  saveWebhookDeliveryLog: mocks.saveLog,
}))

import { sendWebhook } from './webhook-sender'

const endpoint: WebhookEndpoint = {
  id: 'wh-1', companyId: 'company-a', url: 'https://hooks.example.test/orders',
  events: ['order.created'], isActive: true, secret: 'test-secret', createdAt: '2026-01-01T00:00:00Z',
}

describe('webhook delivery failure handling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    mocks.lookup.mockResolvedValue([{ address: '93.184.216.34', family: 4 }])
    mocks.saveLog.mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('retries transient HTTP failures and records the successful attempt', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 429 }))
      .mockResolvedValueOnce(new Response('', { status: 500 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    vi.stubGlobal('fetch', fetchMock)

    const delivery = sendWebhook('order.created', { orderId: '1001' }, [endpoint])
    await vi.runAllTimersAsync()
    await expect(delivery).resolves.toEqual({ sent: 1, success: 1, failed: 0 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(mocks.saveLog).toHaveBeenCalledWith(expect.objectContaining({
      companyId: 'company-a',
      attempts: [
        expect.objectContaining({ attempt: 1, status: 'failed', statusCode: 429 }),
        expect.objectContaining({ attempt: 2, status: 'failed', statusCode: 500 }),
        expect.objectContaining({ attempt: 3, status: 'success', statusCode: 204 }),
      ],
    }))
  })

  it('stops after three network failures and persists an auditable failure log', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('socket timeout'))
    vi.stubGlobal('fetch', fetchMock)

    const delivery = sendWebhook('payment.recorded', { invoiceId: 'inv-1' }, [endpoint])
    await vi.runAllTimersAsync()
    await expect(delivery).resolves.toEqual({ sent: 1, success: 0, failed: 1 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(mocks.saveLog).toHaveBeenCalledWith(expect.objectContaining({
      attempts: expect.arrayContaining([expect.objectContaining({ attempt: 3, status: 'failed', error: 'socket timeout' })]),
    }))
  })

  it('blocks private DNS targets before making a request', async () => {
    mocks.lookup.mockResolvedValue([{ address: '169.254.169.254', family: 4 }])
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(sendWebhook('order.created', {}, [endpoint])).resolves.toEqual({ sent: 1, success: 0, failed: 1 })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(mocks.saveLog).toHaveBeenCalledWith(expect.objectContaining({
      attempts: [expect.objectContaining({ status: 'failed', error: expect.stringContaining('blocked address') })],
    }))
  })
})
