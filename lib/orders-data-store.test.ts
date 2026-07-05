import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    order: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

import { prisma } from '@/lib/prisma'
import { canAccessOrder, createServerOrder, type ServerOrder } from './orders-data-store'
import type { ServerUser } from '@/lib/server-auth'

const ORDER: Omit<ServerOrder, 'id'> = {
  createdAt: '2026-07-04T10:00:00.000Z',
  items: [
    { id: 'p1', title: 'Shampoo', brand: 'B', image: '', category: 'hair', price: 25, rating: 5, stock: 10, quantity: 2 },
  ],
  subtotal: 50,
  tax: 8.68,
  delivery: 5,
  deliveryMethod: 'courier',
  paymentMethod: 'cash',
  discount: 0,
  total: 55,
  firstName: 'Ivan',
  lastName: 'Petrov',
  email: 'ivan@example.com',
  phone: '+37126000000',
  address: 'Riga st 1',
  city: 'Riga',
  language: 'ru',
}

function makeTx() {
  return {
    order: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
    },
    product: { updateMany: vi.fn() },
    promoCode: { updateMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createServerOrder — server-side id generation', () => {
  it('assigns max existing numeric id + 1', async () => {
    vi.mocked(prisma.$queryRaw as any).mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const created = await createServerOrder(ORDER)

    expect(created.id).toBe('1043')
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: '1043' }) })
    )
  })

  it('starts at 1001 when there are no numeric ids yet', async () => {
    vi.mocked(prisma.$queryRaw as any).mockResolvedValue([{ max: null }])
    const tx = makeTx()
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const created = await createServerOrder(ORDER)

    expect(created.id).toBe('1001')
  })

  it('retries with a fresh id when a concurrent order takes the same id', async () => {
    vi.mocked(prisma.$queryRaw as any)
      .mockResolvedValueOnce([{ max: 1042n }])
      .mockResolvedValueOnce([{ max: 1043n }])

    const tx = makeTx()
    vi.mocked(prisma.$transaction as any)
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce(async (fn: any) => fn(tx))

    const created = await createServerOrder(ORDER)

    expect(created.id).toBe('1044')
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('rethrows non-conflict errors without retrying', async () => {
    vi.mocked(prisma.$queryRaw as any).mockResolvedValue([{ max: 1n }])
    vi.mocked(prisma.$transaction as any).mockRejectedValue(new Error('db down'))

    await expect(createServerOrder(ORDER)).rejects.toThrow('db down')
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
  })
})

function makeUser(overrides: Partial<ServerUser> = {}): ServerUser {
  return {
    id: 'user-1',
    email: 'owner@example.com',
    platformRole: 'customer',
    approvalRequired: false,
    auditLoggingEnabled: false,
    bonusPoints: 0,
    mustChangePassword: false,
    createdAt: '2026-07-04T10:00:00.000Z',
    ...overrides,
  }
}

describe('canAccessOrder — IDOR guard for order/payment endpoints', () => {
  it('denies an unauthenticated caller', () => {
    expect(canAccessOrder({ userId: 'user-1', email: 'owner@example.com' }, null)).toBe(false)
  })

  it('allows an admin regardless of ownership', () => {
    const admin = makeUser({ id: 'admin-1', email: 'admin@example.com', platformRole: 'admin' })
    expect(canAccessOrder({ userId: 'user-1', email: 'owner@example.com' }, admin)).toBe(true)
  })

  it('allows the account that owns the order by userId', () => {
    const owner = makeUser({ id: 'user-1', email: 'owner@example.com' })
    expect(canAccessOrder({ userId: 'user-1', email: 'owner@example.com' }, owner)).toBe(true)
  })

  it('denies a different logged-in account even with a matching userId order', () => {
    const otherUser = makeUser({ id: 'user-2', email: 'attacker@example.com' })
    expect(canAccessOrder({ userId: 'user-1', email: 'owner@example.com' }, otherUser)).toBe(false)
  })

  it('falls back to email match only for legacy/guest orders with no userId', () => {
    const caller = makeUser({ id: 'user-9', email: 'owner@example.com' })
    expect(canAccessOrder({ userId: undefined, email: 'owner@example.com' }, caller)).toBe(true)
  })

  it('denies email match when the order has an owning userId (no downgrade to email guessing)', () => {
    const caller = makeUser({ id: 'user-9', email: 'owner@example.com' })
    expect(canAccessOrder({ userId: 'user-1', email: 'owner@example.com' }, caller)).toBe(false)
  })
})
