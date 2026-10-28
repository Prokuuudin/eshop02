import { describe, it, expect, vi, beforeEach } from 'vitest'

const { queryRawMock, transactionMock, orderFindUniqueMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  transactionMock: vi.fn(),
  orderFindUniqueMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/grins-import-maintenance', () => ({ assertGrinsCheckoutOpen: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: queryRawMock,
    $transaction: transactionMock,
    order: { findUnique: orderFindUniqueMock, create: vi.fn(), update: vi.fn() },
  },
}))

import { canAccessOrder, createOrderPaymentSession, createServerOrder, ExistingCheckoutOrderError, InsufficientBonusPointsError, InsufficientStockError, PromoCodeUsageLimitError, type ServerOrder } from './orders-data-store'
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
    $queryRaw: vi.fn().mockResolvedValue([]),
    order: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
    },
    product: {
      findMany: vi.fn().mockResolvedValue([{ id: 'p1', stock: 10, externalId: null, grinsStock: null }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    promoCode: {
      fields: { maxUses: Symbol('maxUses') },
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    user: { findUnique: vi.fn(), updateMany: vi.fn(async () => ({ count: 1 })), update: vi.fn() },
    bonusTransaction: {
      findMany: vi.fn(async () => []),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    keyValueSetting: { findUnique: vi.fn(async () => null) },
    orderNotificationOutbox: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('createServerOrder — server-side id generation', () => {
  it('assigns max existing numeric id + 1', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const created = await createServerOrder(ORDER)

    expect(created.id).toBe('1043')
    expect(tx.order.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ id: '1043' }) })
    )
  })

  it('starts at 1001 when there are no numeric ids yet', async () => {
    queryRawMock.mockResolvedValue([{ max: null }])
    const tx = makeTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const created = await createServerOrder(ORDER)

    expect(created.id).toBe('1001')
  })

  it('retries with a fresh id when a concurrent order takes the same id', async () => {
    queryRawMock
      .mockResolvedValueOnce([{ max: 1042n }])
      .mockResolvedValueOnce([{ max: 1043n }])

    const tx = makeTx()
    transactionMock
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce(async (fn) => fn(tx))

    const created = await createServerOrder(ORDER)

    expect(created.id).toBe('1044')
    expect(transactionMock).toHaveBeenCalledTimes(2)
  })

  it('surfaces the existing order after a concurrent checkout-key conflict', async () => {
    queryRawMock.mockResolvedValue([{ max: 1000n }])
    transactionMock.mockRejectedValue(Object.assign(new Error('unique'), { code: 'P2002' }))
    orderFindUniqueMock.mockResolvedValue({
      id: '1001', ...ORDER, checkoutKey: 'digest', createdAt: new Date(ORDER.createdAt),
      legalDetails: null, promoCode: null, postalCode: null, bonusSpent: null, bonusEarned: null,
      paymentStatus: 'unpaid', paymentProvider: null, paymentSessionId: null,
      stockReservationStatus: 'committed', stockReservedUntil: null, stockReleasedAt: null,
      userId: null, companyId: null,
    })

    await expect(createServerOrder({ ...ORDER, checkoutKey: 'digest' }))
      .rejects.toBeInstanceOf(ExistingCheckoutOrderError)
    expect(transactionMock).toHaveBeenCalledOnce()
    expect(orderFindUniqueMock).toHaveBeenCalledWith({ where: { checkoutKey: 'digest' } })
  })

  it('rethrows non-conflict errors without retrying', async () => {
    queryRawMock.mockResolvedValue([{ max: 1n }])
    transactionMock.mockRejectedValue(new Error('db down'))

    await expect(createServerOrder(ORDER)).rejects.toThrow('db down')
    expect(transactionMock).toHaveBeenCalledTimes(1)
  })

  it('reserves stock only for purchasable products (active, not deleted, valid ERP B2B price)', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))

    await createServerOrder(ORDER)

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'p1',
        isActive: true,
        isDeleted: false,
        OR: [{ externalId: null }, { erpPriceMissing: false }, { manualPriceApproved: true }],
        stock: { gte: 2 },
      },
      data: { stock: { decrement: 2 } },
    })
  })

  it('E/F: fails the order atomically when the product became unsellable before reservation', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    // Inactive or erpPriceMissing rows do not match the purchasable where clause.
    tx.product.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.mockImplementation(async (fn) => fn(tx))

    await expect(createServerOrder(ORDER)).rejects.toThrow(InsufficientStockError)
    expect(tx.order.create).toHaveBeenCalledTimes(1) // rolled back with the transaction
  })

  it('keeps the staff manual-sale path (admin-typed prices) limited to existence and stock', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))

    await createServerOrder(ORDER, undefined, { staffPricedSale: true })

    expect(tx.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1', isDeleted: false, stock: { gte: 2 } },
      data: { stock: { decrement: 2 } },
    })
  })

  it.each(['checkout', 'admin', 'api_v1'] as const)(
    'enqueues the admin notification with source %s in the order transaction',
    async (source) => {
      queryRawMock.mockResolvedValue([{ max: 1042n }])
      const tx = makeTx()
      transactionMock.mockImplementation(async (fn) => fn(tx))

      await createServerOrder(ORDER, undefined, { notificationSource: source, notificationCorrelationId: 'corr-1' })

      expect(tx.orderNotificationOutbox.create).toHaveBeenCalledTimes(1)
      expect(tx.orderNotificationOutbox.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          orderId: '1043',
          notificationType: 'admin_order_created',
          source,
          correlationId: 'corr-1',
        }),
      })
    },
  )

  it('defaults the notification source to checkout', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))

    await createServerOrder(ORDER)

    expect(tx.orderNotificationOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orderId: '1043', source: 'checkout' }),
    })
  })

  it('does not enqueue a notification when the order fails before commit', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    tx.product.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.mockImplementation(async (fn) => fn(tx))

    await expect(createServerOrder(ORDER)).rejects.toThrow(InsufficientStockError)
    expect(tx.orderNotificationOutbox.create).not.toHaveBeenCalled()
  })

  it('rejects the whole order when an item has insufficient stock, instead of silently creating it', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    // updateMany's where clause (stock >= quantity) matched 0 rows — out of stock/missing product.
    tx.product.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.mockImplementation(async (fn) => fn(tx))

    await expect(createServerOrder(ORDER)).rejects.toThrow(InsufficientStockError)
    await expect(createServerOrder(ORDER)).rejects.toMatchObject({ items: ['p1'] })
  })

  it('does not create a discounted order when the atomic bonus debit loses a race', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    tx.user.findUnique.mockResolvedValue({ bonusPoints: 500 })
    tx.user.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const order = { ...ORDER, userId: 'user-1' }

    await expect(createServerOrder(order, async (_tx, balance) => ({
      ...order,
      bonusSpent: Math.min(500, balance ?? 0),
      total: 50,
    }))).rejects.toThrow(InsufficientBonusPointsError)

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'user-1', bonusPoints: { gte: 500 } },
      data: { bonusPoints: { decrement: 500 } },
    })
    expect(tx.order.create).not.toHaveBeenCalled()
  })

  it('rolls back a discounted order when another checkout claims the final promo use', async () => {
    queryRawMock.mockResolvedValue([{ max: 1042n }])
    const tx = makeTx()
    tx.promoCode.updateMany.mockResolvedValue({ count: 0 })
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const order = { ...ORDER, promoCode: 'last-one', discount: 10, total: 45 }

    await expect(createServerOrder(order)).rejects.toThrow(PromoCodeUsageLimitError)

    expect(tx.promoCode.updateMany).toHaveBeenCalledWith({
      where: {
        code: 'LAST-ONE',
        active: true,
        OR: [{ maxUses: null }, { usedCount: { lt: tx.promoCode.fields.maxUses } }],
      },
      data: { usedCount: { increment: 1 } },
    })
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

describe('createOrderPaymentSession - retry serialization', () => {
  function paymentRow(paymentSessionId: string | null = null) {
    return {
      id: '1001', ...ORDER, createdAt: new Date(ORDER.createdAt), paymentMethod: 'paysera',
      legalDetails: null, deliveryLocation: null, pickupStoreId: null, promoCode: null,
      trackingNumber: null, trackingUrl: null, labelUrl: null, shipmentCarrier: null,
      country: 'LV', postalCode: null, bonusSpent: null, bonusEarned: null,
      paymentStatus: 'unpaid', paymentProvider: 'paysera', paymentSessionId,
      stockReservationStatus: 'reserved', stockReservedUntil: new Date(Date.now() + 60_000),
      stockReleasedAt: null, language: 'ru', userId: 'user-1', companyId: null, checkoutKey: null,
    }
  }

  it('serializes two concurrent retries so only the first creates a Paysera order', async () => {
    let storedSession: string | null = null
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn(async () => paymentRow(storedSession)),
        update: vi.fn(async ({ data }: { data: { paymentSessionId: string } }) => {
          storedSession = data.paymentSessionId
          return paymentRow(storedSession)
        }),
      },
    }
    let queue = Promise.resolve()
    transactionMock.mockImplementation((operation) => {
      const run = queue.then(() => operation(tx))
      queue = run.then(() => undefined, () => undefined)
      return run
    })
    let created = 0
    const resolve = vi.fn(async (order: ServerOrder) => {
      if (order.paymentSessionId) {
        return { payseraOrderId: order.paymentSessionId, paymentUrl: 'https://pay.test/reused' }
      }
      created += 1
      return { payseraOrderId: 'session-1', paymentUrl: 'https://pay.test/new' }
    })

    const [first, second] = await Promise.all([
      createOrderPaymentSession('1001', resolve),
      createOrderPaymentSession('1001', resolve),
    ])

    expect(created).toBe(1)
    expect(first.payseraOrderId).toBe('session-1')
    expect(second.payseraOrderId).toBe('session-1')
    expect(resolve.mock.calls[1][0].paymentSessionId).toBe('session-1')
  })

  it('refuses to overwrite an existing in-flight Paysera session', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      order: {
        findUnique: vi.fn(async () => paymentRow('session-1')),
        update: vi.fn(),
      },
    }
    transactionMock.mockImplementation(async (operation) => operation(tx))

    await expect(createOrderPaymentSession('1001', async () => ({
      payseraOrderId: 'session-2', paymentUrl: 'https://pay.test/2',
    }))).rejects.toThrow('payment_session_conflict')
    expect(tx.order.update).not.toHaveBeenCalled()
  })
})
