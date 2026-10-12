import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { permissionMock, flagsMock, transactionMock, findManyMock, acknowledgeMock, auditMock } = vi.hoisted(() => ({
  permissionMock: vi.fn(),
  flagsMock: vi.fn(),
  transactionMock: vi.fn(),
  findManyMock: vi.fn(),
  acknowledgeMock: vi.fn(),
  auditMock: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/stock-ledger-config', () => ({ stockLedgerFlags: flagsMock }))
vi.mock('@/lib/stock-ledger', () => ({ acknowledgeCommittedAllocations: acknowledgeMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    stockAllocation: { findMany: findManyMock },
    $transaction: transactionMock,
  },
}))

import { GET, POST } from './route'

const admin = { id: 'admin-1', email: 'admin@test.invalid' }

function request(method: 'GET' | 'POST', body?: unknown): NextRequest {
  return new NextRequest(`https://shop.test/api/admin/orders/stock-acknowledgment?orderId=o1`, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  })
}

describe('admin stock acknowledgment route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue(admin)
    flagsMock.mockReturnValue({ ledgerEnabled: true })
  })

  it('uses the existing permission boundary before reading allocation state', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))

    const response = await GET(request('GET'))

    expect(response.status).toBe(403)
    expect(permissionMock).toHaveBeenCalledWith('orders.read')
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('fails closed before a transaction when the ledger feature is disabled', async () => {
    flagsMock.mockReturnValue({ ledgerEnabled: false })

    const response = await POST(request('POST', { orderId: 'o1' }))

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'stock_ledger_disabled' })
    expect(permissionMock).toHaveBeenCalledWith('orders.update')
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('serializes the order, acknowledges committed allocations and records one audit event', async () => {
    const tx = {
      $executeRaw: vi.fn(),
      $queryRaw: vi.fn(),
      order: { findUnique: vi.fn().mockResolvedValue({
        id: 'o1', firstName: 'Ada', lastName: 'Lovelace', stockReservationStatus: 'committed',
      }) },
    }
    transactionMock.mockImplementation(async (operation) => operation(tx))
    acknowledgeMock.mockResolvedValue({
      acknowledgmentGroupId: 'ack-group', allocations: 2, quantity: 3, idempotent: false,
    })

    const response = await POST(request('POST', { orderId: 'o1' }))

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, allocations: 2, quantity: 3 })
    expect(tx.$executeRaw).toHaveBeenCalledOnce()
    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    expect(acknowledgeMock).toHaveBeenCalledWith(tx, 'o1', admin.id)
    expect(auditMock).toHaveBeenCalledOnce()
  })
})
