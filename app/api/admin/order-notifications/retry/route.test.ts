import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { authMock, txMock, updateManyMock, auditMock, logMock } = vi.hoisted(() => ({
  authMock: vi.fn(),
  txMock: vi.fn(),
  updateManyMock: vi.fn(),
  auditMock: vi.fn(),
  logMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: authMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/observability', () => ({
  getCorrelationId: vi.fn(() => 'retry-correlation-id'),
  logOperationalEvent: logMock,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: txMock, orderNotificationOutbox: { updateMany: updateManyMock } },
}))

import { POST } from './route'

const request = (orderId: unknown) => new NextRequest('http://localhost/api/admin/order-notifications/retry', {
  method: 'POST', body: JSON.stringify({ orderId }), headers: { 'content-type': 'application/json' },
})

describe('manual admin order notification retry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authMock.mockResolvedValue({ id: 'admin-1', platformRole: 'admin' })
    txMock.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      orderNotificationOutbox: { updateMany: updateManyMock },
    }))
    updateManyMock.mockResolvedValue({ count: 1 })
  })

  it('requires orders.update permission before database access', async () => {
    authMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    expect((await POST(request('1201'))).status).toBe(403)
    expect(txMock).not.toHaveBeenCalled()
  })

  it('queues only a failed notification and records an audit event', async () => {
    const response = await POST(request('1201'))

    expect(response.status).toBe(202)
    expect(updateManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orderId: '1201', status: 'failed' }),
      data: expect.objectContaining({ status: 'pending', attempts: 0 }),
    }))
    expect(auditMock).toHaveBeenCalledOnce()
  })

  it('refuses to replay a sent or otherwise non-failed notification', async () => {
    updateManyMock.mockResolvedValue({ count: 0 })

    const response = await POST(request('1201'))

    expect(response.status).toBe(409)
    expect(auditMock).not.toHaveBeenCalled()
  })
})
