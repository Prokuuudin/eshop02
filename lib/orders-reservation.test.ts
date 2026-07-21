import { beforeEach, describe, expect, it, vi } from 'vitest'

const tx = {
  order: { updateMany: vi.fn(), findUnique: vi.fn() },
  product: { updateMany: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}))

import { prisma } from '@/lib/prisma'
import { applyOrderReservationPaymentState, releaseExpiredStockReservations } from './orders-data-store'

describe('order stock reservation lifecycle', () => {
  beforeEach(() => vi.clearAllMocks())

  it('restores stock once after an expired reservation is atomically released', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([{
      id: 'o1', items: [{ id: 'p1', quantity: 2 }],
    }] as never)
    tx.order.updateMany.mockResolvedValue({ count: 1 })
    tx.product.updateMany.mockResolvedValue({ count: 1 })

    await expect(releaseExpiredStockReservations(new Date('2026-01-01'))).resolves.toBe(1)
    expect(tx.order.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: 'o1', stockReservationStatus: 'reserved' }),
    }))
    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', isDeleted: false },
      data: { stock: { increment: 2 } },
    })
  })

  it('does not restore stock when another worker already released the reservation', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([{
      id: 'o1', items: [{ id: 'p1', quantity: 2 }],
    }] as never)
    tx.order.updateMany.mockResolvedValue({ count: 0 })
    await expect(releaseExpiredStockReservations()).resolves.toBe(0)
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })

  it('commits a paid reservation without restoring stock', async () => {
    tx.order.updateMany.mockResolvedValue({ count: 1 })
    await applyOrderReservationPaymentState(tx as never, 'o1', 'paid')
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'o1', stockReservationStatus: 'reserved' },
      data: { stockReservationStatus: 'committed', stockReservedUntil: null },
    })
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })
})
