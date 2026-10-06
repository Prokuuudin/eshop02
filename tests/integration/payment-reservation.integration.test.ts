import { beforeEach, describe, expect, it, vi } from 'vitest'

const db = vi.hoisted(() => ({ $transaction: vi.fn(), order: { findMany: vi.fn() } }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
import { releaseExpiredStockReservations, updateServerOrderPayment } from '@/lib/orders-data-store'

// Transaction model with serialized row access and rollback. This checks application
// interleavings; deployment verification must additionally exercise real PostgreSQL locks.
let state: {
  order: { id: string; total: number; paymentMethod: string; paymentSessionId: string; paymentStatus: string;
    stockReservationStatus: string; stockReservedUntil: Date | null; items: Array<{ id: string; quantity: number }> };
  stock: number;
  exceptions: string[];
}
let tail: Promise<unknown>

beforeEach(() => {
  vi.clearAllMocks()
  tail = Promise.resolve()
  state = { stock: 0, exceptions: [], order: { id: 'o1', total: 100, paymentMethod: 'paysera', paymentSessionId: 's1', paymentStatus: 'unpaid',
    stockReservationStatus: 'reserved', stockReservedUntil: new Date(Date.now() + 60_000), items: [{ id: 'p1', quantity: 1 }] } }
  db.order.findMany.mockImplementation(async () => [structuredClone(state.order)])
  db.$transaction.mockImplementation((operation: (tx: unknown) => unknown) => {
    const current = tail.then(async () => {
      const draft = structuredClone(state)
      const tx = {
        $queryRaw: vi.fn(),
        order: {
          findUnique: async () => draft.order,
          updateMany: async ({ where, data }: { where: { stockReservationStatus: string; stockReservedUntil?: { lte: Date } }; data: object }) => {
            if (draft.order.stockReservationStatus !== where.stockReservationStatus) return { count: 0 }
            if (where.stockReservedUntil && (!draft.order.stockReservedUntil || draft.order.stockReservedUntil > where.stockReservedUntil.lte)) return { count: 0 }
            Object.assign(draft.order, data); return { count: 1 }
          },
          update: async ({ data }: { data: Record<string, unknown> }) => {
            Object.assign(draft.order, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined)))
            return draft.order
          },
        },
        $executeRaw: vi.fn(),
        product: {
          findMany: async () => [{ id: 'p1', stock: draft.stock, externalId: null, grinsStock: null }],
          updateMany: async ({ where, data }: { where: { stock?: { gte: number } }; data: { stock: { increment?: number; decrement?: number } } }) => {
            if (where.stock && draft.stock < where.stock.gte) return { count: 0 }
            draft.stock += (data.stock.increment ?? 0) - (data.stock.decrement ?? 0); return { count: 1 }
          },
        },
        orderOperationalException: { upsert: async ({ create }: { create: { code: string } }) => { draft.exceptions.push(create.code); return {} } },
      }
      const result = await operation(tx)
      state = draft
      return result
    })
    tail = current.catch(() => undefined)
    return current
  })
})

const paid = () => updateServerOrderPayment('o1', { paymentStatus: 'paid', paymentProvider: 'paysera' }, {
  sessionId: 's1', amount: 10000, amountPaid: 10000, currency: 'EUR',
})

describe('payment and reservation transaction interleavings', () => {
  it('commits exactly once with concurrent duplicate paid callbacks', async () => {
    await Promise.all([paid(), paid()])
    expect(state.order.paymentStatus).toBe('paid')
    expect(state.order.stockReservationStatus).toBe('committed')
    expect(state.stock).toBe(0)
  })
  // Approved release semantics: a verified payment is never turned into an error because
  // the reservation expired; stock is committed or re-held, otherwise staff are alerted.
  it('commits the still-held unit when a verified payment wins the race against cleanup', async () => {
    state.order.stockReservedUntil = new Date(Date.now() - 1)
    const results = await Promise.allSettled([paid(), releaseExpiredStockReservations(), releaseExpiredStockReservations()])
    expect(results.map(result => result.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled'])
    expect(state.order.paymentStatus).toBe('paid')
    expect(state.order.stockReservationStatus).toBe('committed')
    expect(state.stock).toBe(0)
    expect(state.exceptions).toEqual([])
  })
  it('re-holds the released unit exactly once for a verified payment after cleanup', async () => {
    state.order.stockReservedUntil = new Date(Date.now() - 1)
    await Promise.all([releaseExpiredStockReservations(), releaseExpiredStockReservations()])
    expect(state.stock).toBe(1)
    await Promise.all([paid(), paid()])
    expect(state.order.paymentStatus).toBe('paid')
    expect(state.order.stockReservationStatus).toBe('committed')
    expect(state.stock).toBe(0)
    expect(state.exceptions).toEqual([])
  })
  it('keeps a verified late payment paid and raises one exception when the unit was sold meanwhile', async () => {
    state.order.stockReservedUntil = new Date(Date.now() - 1)
    await releaseExpiredStockReservations()
    state.stock = 0
    await Promise.all([paid(), paid()])
    expect(state.order.paymentStatus).toBe('paid')
    expect(state.order.stockReservationStatus).toBe('released')
    expect(state.stock).toBe(0)
    expect(state.exceptions).toEqual(['late_payment_stock_unavailable'])
  })
  it('does not release stock after a successful payment when a stale cleaner runs', async () => {
    const stale = structuredClone(state.order)
    await paid()
    db.order.findMany.mockResolvedValue([stale])
    await releaseExpiredStockReservations(new Date(Date.now() + 120_000))
    expect(state.order.paymentStatus).toBe('paid')
    expect(state.order.stockReservationStatus).toBe('committed')
    expect(state.stock).toBe(0)
  })
})
