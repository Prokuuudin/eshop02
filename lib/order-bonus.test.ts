import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import {
  OrderBonusInsufficientError,
  ORDER_BONUS_SHORTFALL,
  planOrderBonus,
  readOrderBonusShortfalls,
  reconcileOrderBonus,
  type OrderBonusTrigger,
} from './order-bonus'

type Tx = { id: string; userId: string; orderId: string | null; type: string; points: number; balanceAfter: number; remainingPoints: number; expiresAt: Date | null; createdAt: Date; actorUserId?: string | null; reason?: string | null }
type Order = { id: string; userId: string | null; paymentStatus: string; bonusEarned: number | null; items: unknown; subtotal: number; total: number; delivery: number }
type Exception = { orderId: string; code: string; status: string; occurrences: number; resolvedAt: Date | null; resolvedBy: string | null }

/** Minimal in-memory model of the tables the bonus ledger touches. */
function createDb() {
  const state = {
    users: new Map<string, { id: string; bonusPoints: number }>(),
    orders: new Map<string, Order>(),
    statuses: new Map<string, string>(),
    ledger: [] as Tx[],
    exceptions: [] as Exception[],
  }
  let seq = 0
  const matches = (row: Tx, where: Record<string, unknown>): boolean => {
    if (where.orderId !== undefined && row.orderId !== where.orderId) return false
    if (where.userId !== undefined && row.userId !== where.userId) return false
    const type = where.type as { in?: string[] } | string | undefined
    if (typeof type === 'string' && row.type !== type) return false
    if (type && typeof type === 'object' && type.in && !type.in.includes(row.type)) return false
    const remaining = where.remainingPoints as { gt?: number } | undefined
    if (remaining?.gt !== undefined && !(row.remainingPoints > remaining.gt)) return false
    const expires = where.expiresAt as { lte?: Date } | undefined
    if (expires?.lte && !(row.expiresAt && row.expiresAt <= expires.lte)) return false
    const id = where.id as { in?: string[] } | undefined
    if (id?.in && !id.in.includes(row.id)) return false
    return true
  }
  const tx = {
    $queryRaw: vi.fn(async () => []),
    order: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => structuredClone(state.orders.get(where.id) ?? null)),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.flatMap((id) => state.orders.has(id) ? [structuredClone(state.orders.get(id)!)] : [])),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Order> }) => Object.assign(state.orders.get(where.id)!, data)),
    },
    orderStatusRecord: {
      findUnique: vi.fn(async ({ where }: { where: { orderId: string } }) => state.statuses.has(where.orderId) ? { status: state.statuses.get(where.orderId) } : null),
      findMany: vi.fn(async ({ where }: { where: { orderId: { in: string[] } } }) => where.orderId.in.flatMap((orderId) => state.statuses.has(orderId) ? [{ orderId, status: state.statuses.get(orderId)! }] : [])),
    },
    user: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => structuredClone(state.users.get(where.id) ?? null)),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.flatMap((id) => state.users.has(id) ? [structuredClone(state.users.get(id)!)] : [])),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { bonusPoints: number | { increment?: number; decrement?: number } } }) => {
        const user = state.users.get(where.id)!
        const change = data.bonusPoints
        user.bonusPoints = typeof change === 'number' ? change : user.bonusPoints + (change.increment ?? 0) - (change.decrement ?? 0)
        return structuredClone(user)
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; bonusPoints: { gte: number } }; data: { bonusPoints: { decrement: number } } }) => {
        const user = state.users.get(where.id)
        if (!user || user.bonusPoints < where.bonusPoints.gte) return { count: 0 }
        user.bonusPoints -= data.bonusPoints.decrement
        return { count: 1 }
      }),
    },
    bonusTransaction: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => state.ledger.filter((row) => matches(row, where)).map((row) => structuredClone(row))),
      create: vi.fn(async ({ data }: { data: Partial<Tx> }) => {
        const row = { id: `tx${++seq}`, orderId: null, remainingPoints: 0, expiresAt: null, createdAt: new Date(), ...data } as Tx
        state.ledger.push(row)
        return row
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { remainingPoints: { decrement: number } } }) => {
        const row = state.ledger.find((candidate) => candidate.id === where.id)!
        row.remainingPoints -= data.remainingPoints.decrement
        return row
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Tx> }) => {
        const rows = state.ledger.filter((row) => matches(row, where))
        rows.forEach((row) => Object.assign(row, data))
        return { count: rows.length }
      }),
    },
    product: { findMany: vi.fn(async () => []) },
    keyValueSetting: { findUnique: vi.fn(async () => null) },
    orderOperationalException: {
      upsert: vi.fn(async ({ where, create, update }: { where: { orderId_code: { orderId: string; code: string } }; create: { orderId: string; code: string }; update: { status: string; resolvedAt: null; resolvedBy: null } }) => {
        const existing = state.exceptions.find((row) => row.orderId === where.orderId_code.orderId && row.code === where.orderId_code.code)
        if (existing) {
          Object.assign(existing, { status: update.status, resolvedAt: null, resolvedBy: null })
          existing.occurrences += 1
          return existing
        }
        const row = { ...create, status: 'open', occurrences: 1, resolvedAt: null, resolvedBy: null }
        state.exceptions.push(row)
        return row
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { orderId: string; code: string; status: string }; data: Partial<Exception> }) => {
        const rows = state.exceptions.filter((row) => row.orderId === where.orderId && row.code === where.code && row.status === where.status)
        rows.forEach((row) => Object.assign(row, data))
        return { count: rows.length }
      }),
    },
  }
  return { state, tx: tx as never }
}

const order1094 = (overrides: Partial<Order> = {}): Order => ({
  id: '1094', userId: 'u1', paymentStatus: 'unpaid', bonusEarned: 14,
  items: [{ id: 'p1', price: 33.6, quantity: 1 }], subtotal: 33.6, total: 24.95, delivery: 2, ...overrides,
})

/** Order 1094 after checkout: 500 points spent (from a 600 balance), forecast stored, no earn. */
function checkout(db: ReturnType<typeof createDb>, overrides: Partial<Order> = {}, balance = 100) {
  db.state.users.set('u1', { id: 'u1', bonusPoints: balance })
  db.state.orders.set('1094', order1094(overrides))
  db.state.ledger.push({ id: 'spend', userId: 'u1', orderId: '1094', type: 'order_spend', points: -500, balanceAfter: balance, remainingPoints: 0, expiresAt: null, createdAt: new Date() })
}

const balance = (db: ReturnType<typeof createDb>) => db.state.users.get('u1')!.bonusPoints
const ledgerFor = (db: ReturnType<typeof createDb>, type: string) => db.state.ledger.filter((row) => row.orderId === '1094' && row.type === type)
const run = (db: ReturnType<typeof createDb>, trigger: OrderBonusTrigger, extra: { orderStatus?: string; requireFullDebit?: boolean } = {}) =>
  reconcileOrderBonus(db.tx, '1094', { trigger, actorUserId: 'admin', ...extra })
const pay = async (db: ReturnType<typeof createDb>) => {
  db.state.orders.get('1094')!.paymentStatus = 'paid'
  return run(db, 'payment_confirmed')
}

describe('planOrderBonus', () => {
  const ledger = { spent: 500, heldSpent: 500, netEarned: 0, hasEarnRow: false }
  it('expiry of a reservation alone changes nothing', () => {
    expect(planOrderBonus({ paymentStatus: 'unpaid', orderStatus: 'pending' }, ledger, null)).toEqual({ spendRefund: 0, spendRedebit: 0, earn: 0, earnRevoke: 0 })
  })
  it('returns spent points for cancelled, failed and refunded orders', () => {
    for (const state of [{ paymentStatus: 'unpaid', orderStatus: 'cancelled' }, { paymentStatus: 'failed', orderStatus: 'pending' }, { paymentStatus: 'refunded', orderStatus: 'pending' }]) {
      expect(planOrderBonus(state, ledger, null).spendRefund).toBe(500)
    }
  })
  it('never earns twice and never earns without a decided amount', () => {
    expect(planOrderBonus({ paymentStatus: 'paid', orderStatus: 'pending' }, { ...ledger, hasEarnRow: true }, 11).earn).toBe(0)
    expect(planOrderBonus({ paymentStatus: 'paid', orderStatus: 'pending' }, ledger, null).earn).toBe(0)
  })
})

describe('reconcileOrderBonus', () => {
  let db: ReturnType<typeof createDb>
  beforeEach(() => { db = createDb() })

  it('creates nothing at checkout-time states: unpaid order keeps spent points and earns nothing', async () => {
    checkout(db)
    const result = await run(db, 'payment_status_changed')
    expect(result.applied).toEqual({ spendRefund: 0, spendRedebit: 0, earn: 0, earnRevoke: 0 })
    expect(db.state.ledger).toHaveLength(1)
    expect(balance(db)).toBe(100)
  })

  it('earns once on payment confirmation, from the actual paid goods amount, and stores it on the order', async () => {
    checkout(db)
    const first = await pay(db)
    expect(first.finalEarned).toBe(11)
    expect(db.state.orders.get('1094')!.bonusEarned).toBe(11)
    expect(ledgerFor(db, 'order_earn')).toEqual([expect.objectContaining({ points: 11, remainingPoints: 11, balanceAfter: 111, actorUserId: 'admin' })])
    // Duplicate webhook / second click / retry: nothing new.
    await run(db, 'payment_confirmed')
    await run(db, 'shortfall_retry')
    expect(ledgerFor(db, 'order_earn')).toHaveLength(1)
    expect(balance(db)).toBe(111)
  })

  it('never re-credits an order that already has a historical order_earn row', async () => {
    checkout(db)
    db.state.ledger.push({ id: 'legacy', userId: 'u1', orderId: '1094', type: 'order_earn', points: 14, balanceAfter: 114, remainingPoints: 14, expiresAt: null, createdAt: new Date() })
    db.state.users.get('u1')!.bonusPoints = 114
    const result = await pay(db)
    expect(result.finalEarned).toBeNull()
    expect(ledgerFor(db, 'order_earn')).toHaveLength(1)
    expect(balance(db)).toBe(114)
    expect(db.state.orders.get('1094')!.bonusEarned).toBe(14)
  })

  it('does not revoke a historical pre-payment earn on cancellation; returns spent points once', async () => {
    checkout(db)
    db.state.ledger.push({ id: 'legacy', userId: 'u1', orderId: '1094', type: 'order_earn', points: 14, balanceAfter: 114, remainingPoints: 14, expiresAt: null, createdAt: new Date() })
    db.state.users.get('u1')!.bonusPoints = 114
    db.state.statuses.set('1094', 'cancelled')
    await run(db, 'order_cancelled', { orderStatus: 'cancelled' })
    await run(db, 'order_cancelled', { orderStatus: 'cancelled' })
    expect(ledgerFor(db, 'order_spend_refund')).toEqual([expect.objectContaining({ points: 500, remainingPoints: 500 })])
    expect(ledgerFor(db, 'order_earn_revoke')).toHaveLength(0)
    expect(balance(db)).toBe(614)
  })

  it('does not earn for orders without a checkout forecast (imported, admin, API orders)', async () => {
    checkout(db, { bonusEarned: null })
    const result = await pay(db)
    expect(result.finalEarned).toBeNull()
    expect(ledgerFor(db, 'order_earn')).toHaveLength(0)
  })

  it('skips guest orders and deleted customers', async () => {
    db.state.orders.set('1094', order1094({ userId: null }))
    expect((await run(db, 'payment_confirmed')).skipped).toBe('no_user')
    db.state.orders.set('1094', order1094({ userId: 'gone' }))
    expect((await run(db, 'payment_confirmed')).skipped).toBe('no_user')
    expect(db.state.ledger).toHaveLength(0)
  })

  it('returns spent points once on a confirmed payment failure', async () => {
    checkout(db)
    db.state.orders.get('1094')!.paymentStatus = 'failed'
    await run(db, 'payment_status_changed')
    await run(db, 'payment_status_changed')
    expect(ledgerFor(db, 'order_spend_refund')).toHaveLength(1)
    expect(balance(db)).toBe(600)
  })

  it('restore after cancel takes the points again; blocks with exact amounts when the balance is short', async () => {
    checkout(db)
    db.state.statuses.set('1094', 'cancelled')
    await run(db, 'order_cancelled', { orderStatus: 'cancelled' })
    expect(balance(db)).toBe(600)

    db.state.users.get('u1')!.bonusPoints = 120
    const blocked = run(db, 'order_restored', { orderStatus: 'pending', requireFullDebit: true })
    await expect(blocked).rejects.toBeInstanceOf(OrderBonusInsufficientError)
    await expect(run(db, 'order_restored', { orderStatus: 'pending', requireFullDebit: true })).rejects.toMatchObject({ requiredPoints: 500, availablePoints: 120 })
    expect(ledgerFor(db, 'order_spend_redebit')).toHaveLength(0)

    db.state.users.get('u1')!.bonusPoints = 700
    await run(db, 'order_restored', { orderStatus: 'pending', requireFullDebit: true })
    await run(db, 'order_restored', { orderStatus: 'pending', requireFullDebit: true })
    expect(ledgerFor(db, 'order_spend_redebit')).toEqual([expect.objectContaining({ points: -500, balanceAfter: 200 })])
    expect(balance(db)).toBe(200)
  })

  it('failed → paid: records the payment, opens one exception with the exact missing amount, never partial', async () => {
    checkout(db)
    db.state.orders.get('1094')!.paymentStatus = 'failed'
    await run(db, 'payment_status_changed') // +500 back → 600
    db.state.users.get('u1')!.bonusPoints = 200 // customer spent 400 of them meanwhile

    const paid = await pay(db)
    expect(paid.applied.earn).toBe(11) // money received: earning still happens
    expect(paid.shortfallPoints).toBe(500)
    expect(ledgerFor(db, 'order_spend_redebit')).toHaveLength(0) // nothing taken partially
    expect(balance(db)).toBe(211)
    expect(db.state.exceptions).toEqual([expect.objectContaining({ code: ORDER_BONUS_SHORTFALL, status: 'open' })])
    expect((await readOrderBonusShortfalls(db.tx, ['1094'])).get('1094')).toEqual({ shortfallPoints: 500, availablePoints: 211 })

    // Retry with too little balance: still nothing, still open.
    expect((await run(db, 'shortfall_retry')).shortfallPoints).toBe(500)
    expect(balance(db)).toBe(211)
    // Retry once the balance covers it: whole amount, exception resolved, then idempotent.
    db.state.users.get('u1')!.bonusPoints = 650
    expect((await run(db, 'shortfall_retry')).shortfallPoints).toBe(0)
    expect(db.state.exceptions[0]).toMatchObject({ status: 'resolved', resolvedBy: 'admin' })
    await run(db, 'shortfall_retry')
    expect(ledgerFor(db, 'order_spend_redebit')).toHaveLength(1)
    expect(ledgerFor(db, 'order_earn')).toHaveLength(1)
    expect(balance(db)).toBe(150)
  })

  it('full refund: returns spent and revokes earned in one step', async () => {
    checkout(db)
    await pay(db) // 100 + 11 = 111
    db.state.orders.get('1094')!.paymentStatus = 'refunded'
    const result = await run(db, 'full_refund')
    expect(result.applied).toMatchObject({ spendRefund: 500, earnRevoke: 11 })
    expect(balance(db)).toBe(600)
    await run(db, 'full_refund')
    expect(ledgerFor(db, 'order_spend_refund')).toHaveLength(1)
    expect(ledgerFor(db, 'order_earn_revoke')).toHaveLength(1)
  })

  it('full refund after the earned points were spent: exception persists, later operations create no duplicates', async () => {
    // Order without spent points, so the refund step returns nothing that could cover the revoke.
    db.state.users.set('u1', { id: 'u1', bonusPoints: 0 })
    db.state.orders.set('1094', order1094({ total: 26, delivery: 0, subtotal: 26, items: [{ id: 'p1', price: 26, quantity: 1 }] }))
    await pay(db)
    expect(balance(db)).toBe(13)
    db.state.users.get('u1')!.bonusPoints = 4 // 9 of the earned points already spent

    db.state.orders.get('1094')!.paymentStatus = 'refunded'
    const refund = await run(db, 'full_refund')
    expect(refund.shortfallPoints).toBe(13)
    expect(ledgerFor(db, 'order_earn_revoke')).toHaveLength(0)
    expect(balance(db)).toBe(4)
    expect(db.state.exceptions).toEqual([expect.objectContaining({ status: 'open', occurrences: 1 })])

    // Cancelling the refunded order, repeating the refund, payment events and retries:
    // no new credit, no partial debit, the same exception stays open.
    db.state.statuses.set('1094', 'cancelled')
    await run(db, 'order_cancelled', { orderStatus: 'cancelled' })
    await run(db, 'full_refund')
    await run(db, 'payment_confirmed')
    await run(db, 'shortfall_retry')
    expect(ledgerFor(db, 'order_earn')).toHaveLength(1)
    expect(ledgerFor(db, 'order_earn_revoke')).toHaveLength(0)
    expect(ledgerFor(db, 'order_spend_refund')).toHaveLength(0)
    expect(balance(db)).toBe(4)
    expect(db.state.exceptions).toHaveLength(1)
    expect(db.state.exceptions[0].status).toBe('open')
    expect((await readOrderBonusShortfalls(db.tx, ['1094'])).get('1094')).toEqual({ shortfallPoints: 13, availablePoints: 4 })

    // Balance back: one revoke of exactly 13, exception resolved, then nothing more.
    db.state.users.get('u1')!.bonusPoints = 20
    await run(db, 'shortfall_retry')
    await run(db, 'shortfall_retry')
    expect(ledgerFor(db, 'order_earn_revoke')).toEqual([expect.objectContaining({ points: -13, balanceAfter: 7 })])
    expect(db.state.exceptions[0].status).toBe('resolved')
    expect(balance(db)).toBe(7)
  })

  it('ledger sum per customer always equals the balance change', async () => {
    checkout(db, {}, 600)
    db.state.ledger[0].balanceAfter = 100
    db.state.users.get('u1')!.bonusPoints = 100
    await pay(db)
    db.state.orders.get('1094')!.paymentStatus = 'refunded'
    await run(db, 'full_refund')
    const sum = db.state.ledger.reduce((total, row) => total + row.points, 0)
    expect(600 + sum).toBe(balance(db))
  })
})
