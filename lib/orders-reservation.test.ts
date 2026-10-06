import { beforeEach, describe, expect, it, vi } from 'vitest'

const tx = {
  $queryRaw: vi.fn(),
  order: { updateMany: vi.fn(), findUnique: vi.fn() },
  product: { updateMany: vi.fn() },
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    order: { findMany: vi.fn() },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}))

import { prisma } from '@/lib/prisma'
import { applyOrderReservationPaymentState, releaseExpiredStockReservations } from './orders-data-store'

describe('order stock reservation lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    tx.$queryRaw.mockReset().mockResolvedValue([])
    tx.order.findUnique.mockReset().mockResolvedValue({ id: 'o1', items: [{ id: 'p1', quantity: 2 }] })
    tx.product.updateMany.mockReset()
  })

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
    expect(tx.$queryRaw).toHaveBeenCalledBefore(tx.order.findUnique)
    expect(tx.order.findUnique).toHaveBeenCalledBefore(tx.order.updateMany)
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

  it('releases the current qty after an admin edit completed while cleanup waited', async () => {
    let available = 1 // physical 3 minus the original reservation of 2
    let currentQty = 2
    const events: string[] = []
    vi.mocked(prisma.order.findMany).mockResolvedValue([{ id: 'o1', items: [{ id: 'p1', quantity: 2 }] }] as never)
    tx.$queryRaw.mockImplementation(async () => {
      // Admin owns the row first: 2 -> 1 returns one unit before the cleaner acquires it.
      currentQty = 1; available += 1; events.push('admin committed qty=1', 'cleaner acquired Order lock')
      return []
    })
    tx.order.findUnique.mockImplementation(async () => {
      events.push('reread current items')
      return { id: 'o1', items: [{ id: 'p1', quantity: currentQty }] }
    })
    tx.order.updateMany.mockImplementation(async () => { events.push('released once'); return { count: 1 } })
    tx.product.updateMany.mockImplementation(async ({ data }) => { available += data.stock.increment; return { count: 1 } })

    await expect(releaseExpiredStockReservations()).resolves.toBe(1)
    expect(available).toBe(3)
    expect(currentQty).toBe(1)
    expect(events).toEqual(['admin committed qty=1', 'cleaner acquired Order lock', 'reread current items', 'released once'])
    expect(tx.product.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { stock: { increment: 1 } } }))
    expect(prisma.order.findMany).toHaveBeenCalledWith(expect.objectContaining({ select: { id: true } }))
  })

  it('does not release when a candidate disappeared before the lock/read', async () => {
    vi.mocked(prisma.order.findMany).mockResolvedValue([{ id: 'o1' }] as never)
    tx.order.findUnique.mockResolvedValue(null)
    await expect(releaseExpiredStockReservations()).resolves.toBe(0)
    expect(tx.order.updateMany).not.toHaveBeenCalled()
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })
})
