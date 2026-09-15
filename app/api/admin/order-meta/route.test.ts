import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { permissionMock, transactionMock, auditMock } = vi.hoisted(() => ({
  permissionMock: vi.fn(), transactionMock: vi.fn(), auditMock: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transactionMock } }))
vi.mock('@/lib/orders-data-store', () => ({ getServerOrderById: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))

import { POST } from './route'

function post(body: unknown): Promise<Response> {
  return POST(new NextRequest('https://shop.test/api/admin/order-meta', {
    method: 'POST', body: JSON.stringify(body),
  }))
}

function cancellationTx(paymentStatus = 'unpaid') {
  return {
    $queryRaw: vi.fn(),
    order: {
      findUnique: vi.fn().mockResolvedValue({
        id: 'o1', firstName: 'A', lastName: 'B', items: [{ id: 'p1', quantity: 2 }],
        paymentStatus, stockReservationStatus: 'reserved',
      }),
      update: vi.fn(),
    },
    orderStatusRecord: {
      findUnique: vi.fn().mockResolvedValue({ orderId: 'o1', status: 'confirmed' }),
      upsert: vi.fn(),
    },
    orderNote: { findUnique: vi.fn(), upsert: vi.fn() },
    product: { updateMany: vi.fn() },
  }
}

describe('POST /api/admin/order-meta cancellation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue({ id: 'admin', email: 'admin@test.com' })
  })

  it('cancels an unpaid confirmed order and releases its stock', async () => {
    const tx = cancellationTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const response = await post({ orderId: 'o1', status: 'cancelled' })

    expect(response.status).toBe(200)
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', isDeleted: false }, data: { stock: { increment: 2 } },
    })
    expect(tx.orderStatusRecord.upsert).toHaveBeenCalledWith({
      where: { orderId: 'o1' }, create: { orderId: 'o1', status: 'cancelled' }, update: { status: 'cancelled' },
    })
    expect(auditMock).toHaveBeenCalledOnce()
  })

  it('returns a useful conflict code for a paid order', async () => {
    const tx = cancellationTx('paid')
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const response = await post({ orderId: 'o1', status: 'cancelled' })

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'paid_order_requires_refund' })
    expect(tx.orderStatusRecord.upsert).not.toHaveBeenCalled()
  })

  it('restores a cancelled order and reserves its stock again', async () => {
    const tx = cancellationTx()
    tx.orderStatusRecord.findUnique.mockResolvedValue({ orderId: 'o1', status: 'cancelled' })
    tx.order.findUnique.mockResolvedValue({
      id: 'o1', firstName: 'A', lastName: 'B', items: [{ id: 'p1', quantity: 2 }],
      paymentStatus: 'unpaid', stockReservationStatus: 'released',
    })
    tx.product.updateMany.mockResolvedValue({ count: 1 })
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const response = await post({ orderId: 'o1', status: 'pending' })

    expect(response.status).toBe(200)
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', isDeleted: false, stock: { gte: 2 } }, data: { stock: { decrement: 2 } },
    })
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { stockReservationStatus: 'committed', stockReleasedAt: null, stockReservedUntil: null },
    })
  })
})
