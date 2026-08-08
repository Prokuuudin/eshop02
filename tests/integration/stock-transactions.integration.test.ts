import { beforeEach, describe, expect, it, vi } from 'vitest'

type State = {
  stock: Record<string, number>
  orders: string[]
}

const state: State = { stock: {}, orders: [] }

const prismaMock = vi.hoisted(() => ({
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  order: { findUnique: vi.fn(), update: vi.fn() },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  createServerOrder,
  InsufficientStockError,
  type ServerOrder,
} from '@/lib/orders-data-store'

const baseOrder: Omit<ServerOrder, 'id'> = {
  createdAt: '2026-07-19T10:00:00.000Z',
  items: [
    { id: 'p1', title: 'One', brand: 'B', image: '', category: 'hair', price: 10, rating: 5, stock: 5, quantity: 2 },
    { id: 'p2', title: 'Two', brand: 'B', image: '', category: 'hair', price: 20, rating: 5, stock: 5, quantity: 1 },
  ],
  subtotal: 40,
  tax: 0,
  delivery: 0,
  deliveryMethod: 'pickup',
  paymentMethod: 'card',
  discount: 0,
  total: 40,
  firstName: 'Test',
  lastName: 'Buyer',
  email: 'buyer@example.com',
  phone: '+37120000000',
  address: 'Riga',
  city: 'Riga',
}

function transactionClient(draft: State) {
  return {
    order: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        draft.orders.push(String(data.id))
        return data
      }),
    },
    product: {
      updateMany: vi.fn(async ({ where, data }: {
        where: { id: string; stock: { gte: number } }
        data: { stock: { decrement: number } }
      }) => {
        const available = draft.stock[where.id]
        if (available === undefined || available < where.stock.gte) return { count: 0 }
        draft.stock[where.id] = available - data.stock.decrement
        return { count: 1 }
      }),
    },
    promoCode: { updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  }
}

beforeEach(() => {
  state.stock = { p1: 5, p2: 3 }
  state.orders = []
  vi.clearAllMocks()
  prismaMock.$queryRaw.mockResolvedValue([{ max: 1000n }])
  prismaMock.$transaction.mockImplementation(async (operation: (tx: ReturnType<typeof transactionClient>) => unknown) => {
    const draft = structuredClone(state)
    const result = await operation(transactionClient(draft))
    state.stock = draft.stock
    state.orders = draft.orders
    return result
  })
})

describe('order stock transaction integration', () => {
  it('commits the order and all stock decrements together', async () => {
    const created = await createServerOrder(baseOrder)

    expect(created.id).toBe('1001')
    expect(state.orders).toEqual(['1001'])
    expect(state.stock).toEqual({ p1: 3, p2: 2 })
  })

  it('rolls back the order and earlier decrements when any item is unavailable', async () => {
    state.stock.p2 = 0

    await expect(createServerOrder(baseOrder)).rejects.toBeInstanceOf(InsufficientStockError)
    expect(state.orders).toEqual([])
    expect(state.stock).toEqual({ p1: 5, p2: 0 })
  })

  it('allows only one of two concurrent checkouts to claim the last unit', async () => {
    state.stock = { p1: 1 }
    const oneItemOrder = {
      ...baseOrder,
      items: [{ ...baseOrder.items[0], quantity: 1 }],
      subtotal: 10,
      total: 10,
    }

    let transactionTail = Promise.resolve()
    prismaMock.$transaction.mockImplementation((operation: (tx: ReturnType<typeof transactionClient>) => unknown) => {
      const current = transactionTail.then(async () => {
        const draft = structuredClone(state)
        const result = await operation(transactionClient(draft))
        state.stock = draft.stock
        state.orders = draft.orders
        return result
      })
      transactionTail = current.then(() => undefined, () => undefined)
      return current
    })

    const results = await Promise.allSettled([
      createServerOrder(oneItemOrder),
      createServerOrder(oneItemOrder),
    ])

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(state.stock.p1).toBe(0)
  })
})
