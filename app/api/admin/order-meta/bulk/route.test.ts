import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { permissionMock, transactionMock, auditMock } = vi.hoisted(() => ({
  permissionMock: vi.fn(), transactionMock: vi.fn(), auditMock: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transactionMock } }))
import { POST } from './route'

const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/admin/order-meta/bulk', {
  method: 'POST', body: JSON.stringify(body),
}))

function txFor(order: Record<string, unknown>, currentStatus = 'pending') {
  return {
    $executeRaw: vi.fn(), $queryRaw: vi.fn(),
    order: { findMany: vi.fn().mockResolvedValue([order]), update: vi.fn() },
    orderStatusRecord: {
      findMany: vi.fn().mockResolvedValue([{ orderId: order.id, status: currentStatus }]),
      upsert: vi.fn(),
    },
    product: { updateMany: vi.fn() },
  }
}

describe('POST /api/admin/order-meta/bulk', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue({ id: 'admin', email: 'admin@test.com' })
  })

  it('checks orders.update permission before parsing or mutating', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post({ orderIds: ['o1'], status: 'confirmed' })).status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid status and empty order list', async () => {
    expect((await post({ orderIds: [], status: 'forged' })).status).toBe(400)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('refuses to cancel a paid order without a refund flow', async () => {
    const tx = txFor({ id: 'o1', firstName: 'A', lastName: 'B', items: [], paymentStatus: 'paid', stockReservationStatus: 'reserved' })
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const response = await post({ orderIds: ['o1'], status: 'cancelled' })
    expect(response.status).toBe(409)
    expect(tx.orderStatusRecord.upsert).not.toHaveBeenCalled()
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })

  it('releases reserved stock exactly once when cancelling an unpaid order', async () => {
    const tx = txFor({
      id: 'o1', firstName: 'A', lastName: 'B', paymentStatus: 'unpaid', stockReservationStatus: 'reserved',
      items: [{ id: 'p1', quantity: 2 }],
    })
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const response = await post({ orderIds: ['o1', 'o1'], status: 'cancelled' })
    expect(response.status).toBe(200)
    expect(tx.product.updateMany).toHaveBeenCalledOnce()
    expect(tx.product.updateMany).toHaveBeenCalledWith({ where: { id: 'p1', isDeleted: false }, data: { stock: { increment: 2 } } })
    expect(tx.order.update).toHaveBeenCalledOnce()
    expect(auditMock).toHaveBeenCalledOnce()
    expect(await response.json()).toMatchObject({ ok: true, updated: 1 })
  })
})

describe('POST /api/admin/order-meta/bulk shipment guard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue({ id: 'admin', email: 'admin@test.com' })
  })

  function shipmentTx(blockedIds: string[], reservation: Record<string, string> = {}) {
    const orders = ['o1', 'o2'].map((id) => ({ id, firstName: 'A', lastName: 'B', items: [], paymentStatus: 'paid', stockReservationStatus: reservation[id] ?? 'committed' }))
    return {
      $executeRaw: vi.fn(), $queryRaw: vi.fn(),
      order: { findMany: vi.fn().mockResolvedValue(orders), update: vi.fn() },
      orderStatusRecord: {
        findMany: vi.fn().mockResolvedValue(orders.map((order) => ({ orderId: order.id, status: 'confirmed' }))),
        upsert: vi.fn(),
      },
      orderOperationalException: { findMany: vi.fn().mockResolvedValue(blockedIds.map((orderId) => ({ orderId }))) },
      product: { updateMany: vi.fn() },
    }
  }

  it('rejects the whole batch when any order has an open late-payment exception', async () => {
    const tx = shipmentTx(['o2'])
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const response = await post({ orderIds: ['o1', 'o2'], status: 'shipped' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'late_payment_stock_unavailable:o2' })
    expect(tx.orderOperationalException.findMany).toHaveBeenCalledWith({
      where: { orderId: { in: ['o1', 'o2'] }, code: 'late_payment_stock_unavailable', status: 'open' },
      select: { orderId: true },
    })
    expect(tx.$queryRaw).toHaveBeenCalledBefore(tx.orderOperationalException.findMany)
    expect(tx.orderStatusRecord.upsert).not.toHaveBeenCalled()
    expect(auditMock).not.toHaveBeenCalled()
  })

  it.each(['released', 'reserved'])('rejects the whole batch when one order has %s stock', async (state) => {
    const tx = shipmentTx([], { o2: state })
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const response = await post({ orderIds: ['o1', 'o2'], status: 'shipped' })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'order_stock_not_committed:o2' })
    expect(tx.orderStatusRecord.upsert).not.toHaveBeenCalled()
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('ships the batch when no exception is open and all stock is committed', async () => {
    const tx = shipmentTx([])
    transactionMock.mockImplementation(async (fn) => fn(tx))

    expect((await post({ orderIds: ['o1', 'o2'], status: 'shipped' })).status).toBe(200)
    expect(tx.orderStatusRecord.upsert).toHaveBeenCalledTimes(2)
  })
})