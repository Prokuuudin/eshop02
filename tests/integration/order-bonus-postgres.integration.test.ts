import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { assertNotProductionDatabaseUrl } from '../../scripts/e2e-database-guard'

vi.mock('server-only', () => ({}))

// Real PostgreSQL row locks: concurrent payment confirmations, cancellations and refunds
// must leave exactly one ledger movement each, and the ledger must always match balances.
// Run only against a disposable database:
//   ALLOW_BONUS_DB_TESTS=isolated-postgres DATABASE_URL=postgresql://…@127.0.0.1:…/… npm run test:integration
const enabled = process.env.ALLOW_BONUS_DB_TESTS === 'isolated-postgres'
const suite = enabled ? describe : describe.skip

suite('order bonus ledger on isolated PostgreSQL', () => {
  let prisma: typeof import('@/lib/prisma')['prisma']
  let store: typeof import('@/lib/orders-data-store')
  let bonus: typeof import('@/lib/order-bonus')
  const userIds: string[] = []
  const orderIds: string[] = []
  const productIds: string[] = []

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
    assertNotProductionDatabaseUrl(process.env.DATABASE_URL, 'bonus ledger integration tests')
    ;({ prisma } = await import('@/lib/prisma'))
    store = await import('@/lib/orders-data-store')
    bonus = await import('@/lib/order-bonus')
  })

  afterEach(async () => {
    await prisma.orderOperationalException.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.orderStatusRecord.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.bonusTransaction.deleteMany({ where: { userId: { in: userIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    await prisma.user.deleteMany({ where: { id: { in: userIds } } })
    await prisma.stockAllocation.deleteMany({ where: { productId: { in: productIds } } })
    await prisma.product.deleteMany({ where: { id: { in: productIds } } })
    userIds.length = 0
    orderIds.length = 0
    productIds.length = 0
  })

  afterAll(async () => {
    if (prisma) await prisma.$disconnect()
  })

  /** A checkout order: `spent` points already taken (ledger row), forecast stored, not paid. */
  async function checkoutOrder(input: { balance: number; spent: number; total: number; subtotal: number; delivery?: number }) {
    const userId = `bonus-it-${randomUUID()}`
    const orderId = `bonus-it-${randomUUID()}`
    userIds.push(userId)
    orderIds.push(orderId)
    await prisma.user.create({ data: { id: userId, email: `${userId}@example.invalid`, passwordHash: 'x', bonusPoints: input.balance, updatedAt: new Date() } })
    await prisma.order.create({ data: {
      id: orderId, createdAt: new Date(), items: [{ id: 'none', price: input.subtotal, quantity: 1 }],
      subtotal: input.subtotal, tax: 0, delivery: input.delivery ?? 0, deliveryMethod: 'pickup', paymentMethod: 'bank',
      discount: 0, total: input.total, firstName: 'Synthetic', lastName: 'Bonus', email: 'bonus@example.invalid',
      phone: '000', address: 'Synthetic', city: 'Synthetic', userId, bonusSpent: input.spent, bonusEarned: 0,
    } })
    if (input.spent > 0) {
      await prisma.bonusTransaction.create({ data: { userId, orderId, type: 'order_spend', points: -input.spent, balanceAfter: input.balance, reason: 'synthetic checkout' } })
    }
    return { userId, orderId, startBalance: input.balance + input.spent }
  }

  const balanceOf = async (userId: string) => (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).bonusPoints
  const rows = (orderId: string, type: string) => prisma.bonusTransaction.findMany({ where: { orderId, type } })
  async function ledgerMatchesBalance(userId: string, startBalance: number) {
    const sum = (await prisma.bonusTransaction.findMany({ where: { userId } })).reduce((total, row) => total + row.points, 0)
    expect(startBalance + sum).toBe(await balanceOf(userId))
  }
  const cancel = (orderId: string) => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
    // Same guard as the admin routes: a paid order cannot be cancelled.
    if ((await tx.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus === 'paid') return
    await tx.orderStatusRecord.upsert({ where: { orderId }, create: { orderId, status: 'cancelled' }, update: { status: 'cancelled' } })
    await bonus.reconcileOrderBonus(tx, orderId, { trigger: 'order_cancelled', orderStatus: 'cancelled' })
  })
  const fullRefund = (orderId: string) => prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } })
    if (order.paymentStatus !== 'paid') return null
    await bonus.lockOrderBonusUser(tx, order.userId)
    await tx.order.update({ where: { id: orderId }, data: { paymentStatus: 'refunded' } })
    return bonus.reconcileOrderBonus(tx, orderId, { trigger: 'full_refund' })
  })

  it('earns exactly once under concurrent payment confirmations (webhook retries + manual click)', async () => {
    const { userId, orderId, startBalance } = await checkoutOrder({ balance: 100, spent: 0, total: 26, subtotal: 26 })
    await Promise.all(Array.from({ length: 8 }, () => store.updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'manual' })))
    expect(await rows(orderId, 'order_earn')).toEqual([expect.objectContaining({ points: 13, remainingPoints: 13 })])
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).bonusEarned).toBe(13)
    expect(await balanceOf(userId)).toBe(113)
    await ledgerMatchesBalance(userId, startBalance)
  })

  it('returns spent points once under concurrent cancellations; expiry-like no-ops change nothing', async () => {
    const { userId, orderId, startBalance } = await checkoutOrder({ balance: 100, spent: 500, total: 24.95, subtotal: 33.6, delivery: 2 })
    await Promise.all(Array.from({ length: 6 }, () => cancel(orderId)))
    expect(await rows(orderId, 'order_spend_refund')).toHaveLength(1)
    expect(await balanceOf(userId)).toBe(600)
    await ledgerMatchesBalance(userId, startBalance)
  })

  it('cancel racing a payment confirmation ends in one consistent state', async () => {
    const { userId, orderId, startBalance } = await checkoutOrder({ balance: 100, spent: 500, total: 24.95, subtotal: 33.6, delivery: 2 })
    await Promise.all([
      cancel(orderId),
      store.updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'manual' }),
      cancel(orderId),
    ])
    expect(await rows(orderId, 'order_earn')).toHaveLength(1)
    expect((await rows(orderId, 'order_spend_refund')).length).toBeLessThanOrEqual(1)
    await ledgerMatchesBalance(userId, startBalance)
  })

  it('full refund of spent earned points keeps one open exception and never duplicates movements', async () => {
    const { userId, orderId, startBalance } = await checkoutOrder({ balance: 0, spent: 0, total: 26, subtotal: 26 })
    await store.updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'manual' })
    expect(await balanceOf(userId)).toBe(13)
    // The customer spends 9 of the earned points elsewhere (admin adjustment stands in for checkout).
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: userId }, data: { bonusPoints: { decrement: 9 } } })
      await tx.bonusTransaction.create({ data: { userId, type: 'admin_adjustment', points: -9, balanceAfter: 4, reason: 'synthetic spend' } })
    })

    await Promise.all([fullRefund(orderId), fullRefund(orderId), fullRefund(orderId)])
    expect(await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).toMatchObject({ paymentStatus: 'refunded' })
    expect(await rows(orderId, 'order_earn_revoke')).toHaveLength(0)
    expect(await balanceOf(userId)).toBe(4)
    const exception = await prisma.orderOperationalException.findUniqueOrThrow({ where: { orderId_code: { orderId, code: bonus.ORDER_BONUS_SHORTFALL } } })
    expect(exception).toMatchObject({ status: 'open', occurrences: 1 })
    expect((await bonus.readOrderBonusShortfalls(prisma, [orderId])).get(orderId)).toEqual({ shortfallPoints: 13, availablePoints: 4 })

    // Late gateway events, cancellation and retries: nothing new while the balance is short.
    await store.updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'manual' })
    await store.updateServerOrderPayment(orderId, { paymentStatus: 'failed' })
    await cancel(orderId)
    await prisma.$transaction((tx) => bonus.reconcileOrderBonus(tx, orderId, { trigger: 'shortfall_retry' }))
    expect(await rows(orderId, 'order_earn')).toHaveLength(1)
    expect(await rows(orderId, 'order_earn_revoke')).toHaveLength(0)
    expect(await rows(orderId, 'order_spend_refund')).toHaveLength(0)
    expect(await balanceOf(userId)).toBe(4)
    expect(await prisma.orderOperationalException.count({ where: { orderId } })).toBe(1)

    // Balance back: concurrent retries revoke exactly once and resolve the exception.
    await prisma.user.update({ where: { id: userId }, data: { bonusPoints: { increment: 20 } } })
    await prisma.bonusTransaction.create({ data: { userId, type: 'admin_adjustment', points: 20, balanceAfter: 24, reason: 'synthetic top-up' } })
    await Promise.all(Array.from({ length: 4 }, () => prisma.$transaction((tx) => bonus.reconcileOrderBonus(tx, orderId, { trigger: 'shortfall_retry' }))))
    expect(await rows(orderId, 'order_earn_revoke')).toEqual([expect.objectContaining({ points: -13 })])
    expect(await balanceOf(userId)).toBe(11)
    expect(await prisma.orderOperationalException.findUniqueOrThrow({ where: { orderId_code: { orderId, code: bonus.ORDER_BONUS_SHORTFALL } } })).toMatchObject({ status: 'resolved' })
    await ledgerMatchesBalance(userId, startBalance)
  })

  it('cancelled → late paid (duplicate webhooks): returned points taken again once, earned once', async () => {
    const { userId, orderId, startBalance } = await checkoutOrder({ balance: 100, spent: 500, total: 24.95, subtotal: 33.6, delivery: 2 })
    await cancel(orderId)
    expect(await balanceOf(userId)).toBe(600)
    await Promise.all(Array.from({ length: 6 }, () => store.updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'manual' })))
    expect(await rows(orderId, 'order_spend_redebit')).toEqual([expect.objectContaining({ points: -500 })])
    expect(await rows(orderId, 'order_earn')).toEqual([expect.objectContaining({ points: 11 })])
    expect(await rows(orderId, 'order_spend_refund')).toHaveLength(1)
    expect(await balanceOf(userId)).toBe(111)
    expect(await prisma.orderOperationalException.count({ where: { orderId } })).toBe(0)
    await ledgerMatchesBalance(userId, startBalance)
  })

  it('cancelled → late paid with too few points: payment recorded, one exception, no partial debit, retries idempotent', async () => {
    const { userId, orderId, startBalance } = await checkoutOrder({ balance: 100, spent: 500, total: 24.95, subtotal: 33.6, delivery: 2 })
    await cancel(orderId)
    await prisma.user.update({ where: { id: userId }, data: { bonusPoints: { decrement: 450 } } })
    await prisma.bonusTransaction.create({ data: { userId, type: 'admin_adjustment', points: -450, balanceAfter: 150, reason: 'synthetic spend' } })

    await Promise.all(Array.from({ length: 5 }, () => store.updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'manual' })))
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paymentStatus).toBe('paid')
    expect(await rows(orderId, 'order_spend_redebit')).toHaveLength(0)
    expect(await rows(orderId, 'order_earn')).toHaveLength(1)
    expect(await balanceOf(userId)).toBe(161)
    expect(await prisma.orderOperationalException.findMany({ where: { orderId } })).toEqual([
      expect.objectContaining({ code: bonus.ORDER_BONUS_SHORTFALL, status: 'open', occurrences: 1 }),
    ])
    expect((await bonus.readOrderBonusShortfalls(prisma, [orderId])).get(orderId)).toEqual({ shortfallPoints: 500, availablePoints: 161 })

    await prisma.user.update({ where: { id: userId }, data: { bonusPoints: { increment: 400 } } })
    await prisma.bonusTransaction.create({ data: { userId, type: 'admin_adjustment', points: 400, balanceAfter: 561, reason: 'synthetic top-up' } })
    await Promise.all(Array.from({ length: 3 }, () => prisma.$transaction((tx) => bonus.reconcileOrderBonus(tx, orderId, { trigger: 'shortfall_retry' }))))
    expect(await rows(orderId, 'order_spend_redebit')).toEqual([expect.objectContaining({ points: -500, balanceAfter: 61 })])
    expect(await prisma.orderOperationalException.findUniqueOrThrow({ where: { orderId_code: { orderId, code: bonus.ORDER_BONUS_SHORTFALL } } })).toMatchObject({ status: 'resolved' })
    await ledgerMatchesBalance(userId, startBalance)
  })

  it('late payment of a cancelled order keeps the stock exception and the bonus re-debit side by side', async () => {
    const { userId, orderId, startBalance } = await checkoutOrder({ balance: 100, spent: 500, total: 24.95, subtotal: 33.6, delivery: 2 })
    const productId = `bonus-it-p-${randomUUID()}`
    productIds.push(productId)
    await prisma.product.create({ data: { id: productId, title: 'Sold out', brand: 'Pro', price: 33.6, category: 'hair', stock: 0, isActive: true, isDeleted: false, updatedAt: new Date() } })
    await prisma.order.update({ where: { id: orderId }, data: {
      items: [{ id: productId, title: 'Sold out', price: 33.6, quantity: 1 }],
      stockReservationStatus: 'released', stockReleasedAt: new Date(),
    } })
    await cancel(orderId)

    await store.updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'manual' })
    await store.updateServerOrderPayment(orderId, { paymentStatus: 'paid', paymentProvider: 'manual' })
    const exceptions = await prisma.orderOperationalException.findMany({ where: { orderId }, orderBy: { code: 'asc' } })
    expect(exceptions.map((row) => [row.code, row.status])).toEqual([['late_payment_stock_unavailable', 'open']])
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).stockReservationStatus).toBe('released')
    expect(await rows(orderId, 'order_spend_redebit')).toHaveLength(1)
    expect(await rows(orderId, 'order_earn')).toHaveLength(1)
    await ledgerMatchesBalance(userId, startBalance)
  })

  it('restore is rolled back as a whole when the balance cannot cover the re-debit', async () => {
    const { userId, orderId } = await checkoutOrder({ balance: 100, spent: 500, total: 24.95, subtotal: 33.6, delivery: 2 })
    await cancel(orderId)
    await prisma.user.update({ where: { id: userId }, data: { bonusPoints: 120 } })
    const restore = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
      await tx.orderStatusRecord.update({ where: { orderId }, data: { status: 'pending' } })
      await bonus.reconcileOrderBonus(tx, orderId, { trigger: 'order_restored', orderStatus: 'pending', requireFullDebit: true })
    })
    await expect(restore).rejects.toMatchObject({ requiredPoints: 500, availablePoints: 120 })
    expect((await prisma.orderStatusRecord.findUniqueOrThrow({ where: { orderId } })).status).toBe('cancelled')
    expect(await rows(orderId, 'order_spend_redebit')).toHaveLength(0)
    expect(await balanceOf(userId)).toBe(120)
  })
})
