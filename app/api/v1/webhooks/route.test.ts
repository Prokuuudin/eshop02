import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(), listEndpoints: vi.fn(), listDeliveries: vi.fn(),
  createEndpoint: vi.fn(), deleteEndpoint: vi.fn(), trigger: vi.fn(),
}))

vi.mock('@/lib/api-helpers', () => ({
  authenticateRequest: mocks.authenticate,
  errorResponse: (error: string, status = 400) => NextResponse.json({ error }, { status }),
  successResponse: (data: unknown, status = 200) => NextResponse.json({ success: true, data }, { status }),
}))
vi.mock('@/lib/api-guard', () => ({ guardOrigin: () => null }))
vi.mock('@/lib/webhooks-store', () => ({
  listWebhookEndpoints: mocks.listEndpoints,
  listWebhookDeliveryLogs: mocks.listDeliveries,
  createWebhookEndpoint: mocks.createEndpoint,
  deleteWebhookEndpoint: mocks.deleteEndpoint,
  maskWebhookSecret: (secret: string) => `masked-${secret.slice(-4)}`,
}))
vi.mock('@/lib/webhook-sender', () => ({ triggerCompanyWebhook: mocks.trigger }))

import { DELETE, GET, POST } from './route'

const request = (method: string, body?: unknown, query = '') => new NextRequest(
  `https://shop.test/api/v1/webhooks${query}`,
  { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) },
)

describe('/api/v1/webhooks tenant and authorization boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticate.mockResolvedValue({ authenticated: true, user: { id: 'u1', companyId: 'company-a', apiAccess: true } })
    mocks.listEndpoints.mockResolvedValue([])
    mocks.listDeliveries.mockResolvedValue([])
  })

  it('rejects unauthenticated access before reading webhook data', async () => {
    mocks.authenticate.mockResolvedValue({ authenticated: false, error: 'Unauthorized', status: 401 })
    expect((await GET(request('GET'))).status).toBe(401)
    expect(mocks.listEndpoints).not.toHaveBeenCalled()
  })

  it('always scopes endpoint and delivery reads to the authenticated company', async () => {
    expect((await GET(request('GET'))).status).toBe(200)
    expect(mocks.listEndpoints).toHaveBeenCalledWith('company-a')
    expect(mocks.listDeliveries).toHaveBeenCalledWith('company-a', 50)
  })

  it('creates and test-delivers only inside the authenticated company', async () => {
    const endpoint = { id: 'wh-1', companyId: 'company-a', url: 'https://hooks.example.test/order', events: ['order.created'], secret: 'secret', createdAt: '2026-01-01' }
    mocks.createEndpoint.mockResolvedValue(endpoint)
    mocks.trigger.mockResolvedValue({ sent: 1, success: 1, failed: 0 })
    const response = await POST(request('POST', { url: endpoint.url, events: endpoint.events, testNow: true }))
    expect(response.status).toBe(201)
    expect(mocks.createEndpoint).toHaveBeenCalledWith(expect.objectContaining({ companyId: 'company-a' }))
    expect(mocks.trigger).toHaveBeenCalledWith('company-a', 'order.created', expect.anything())
  })

  it('cannot delete another tenant endpoint because company scope is part of the delete', async () => {
    mocks.deleteEndpoint.mockResolvedValue(false)
    expect((await DELETE(request('DELETE', undefined, '?id=company-b-hook'))).status).toBe(404)
    expect(mocks.deleteEndpoint).toHaveBeenCalledWith('company-a', 'company-b-hook')
  })

  it('rejects non-https and unsupported event subscriptions', async () => {
    expect((await POST(request('POST', { url: 'http://localhost/hook', events: ['order.created'] }))).status).toBe(400)
    expect((await POST(request('POST', { url: 'https://hooks.example.test', events: ['user.password'] }))).status).toBe(400)
    expect(mocks.createEndpoint).not.toHaveBeenCalled()
  })
})
