import 'server-only'

import { calcEarnedPointsForPayment } from '@/lib/bonus-program'
import { getBonusProgramConfig } from '@/lib/bonus-config-server-store'
import { bonusExpiryDate, consumeBonusLots, expireBonusPoints, getBonusExpiryDays } from '@/lib/bonus-ledger'
import { toNum } from '@/lib/decimal'
import type { ExtendedTransactionClient } from '@/lib/prisma'

/**
 * Order-linked bonus movements.
 *
 * The bonus ledger (BonusTransaction rows with this orderId) is the source of truth for
 * what has already been applied to an order. `reconcileOrderBonus` derives what *should*
 * be applied from the order state, compares it with the ledger and writes only the
 * difference, so repeated calls (duplicate webhooks, double clicks, retries) are no-ops.
 *
 * Rules:
 * - Spending happens at checkout (`order_spend`) and is never touched here, except:
 *   unpaid cancelled / `failed` / `refunded` orders get their spent points back once
 *   (`order_spend_refund`); leaving those states — including a late confirmed payment of a
 *   cancelled order — takes them again (`order_spend_redebit`). Stock-reservation expiry
 *   alone changes nothing.
 * - Earning happens only on the first payment confirmation (`order_earn`), for orders
 *   created by this shop's checkout (non-null `Order.bonusEarned` forecast) that have no
 *   `order_earn` row yet. Historical rows are never re-credited and never revoked, except
 *   by an explicit full refund (`order_earn_revoke`).
 * - Debits are all-or-nothing and never make a balance negative. A debit that does not fit
 *   the balance is not applied; an open `bonus_shortfall` exception records it instead and
 *   the exact missing amount is always derivable from the ledger (see `readOrderBonusShortfall`).
 *
 * Callers must hold the Order row lock (FOR UPDATE) and should lock the customer row with
 * `lockOrderBonusUser` *before* any Product locks: checkout locks User before Product, so
 * the same order everywhere prevents deadlocks.
 */

export const ORDER_BONUS_SHORTFALL = 'bonus_shortfall'

export const ORDER_BONUS_TX = {
  spend: 'order_spend',
  spendRefund: 'order_spend_refund',
  spendRedebit: 'order_spend_redebit',
  earn: 'order_earn',
  earnRevoke: 'order_earn_revoke',
} as const

const SPEND_TYPES: string[] = [ORDER_BONUS_TX.spend, ORDER_BONUS_TX.spendRefund, ORDER_BONUS_TX.spendRedebit]
const EARN_TYPES: string[] = [ORDER_BONUS_TX.earn, ORDER_BONUS_TX.earnRevoke]

export type OrderBonusTrigger =
  | 'payment_confirmed'
  | 'payment_status_changed'
  | 'order_cancelled'
  | 'order_restored'
  | 'full_refund'
  | 'shortfall_retry'

export type OrderBonusLedger = {
  /** Points taken at checkout (positive). */
  spent: number
  /** Points currently held by the order (spent − refunded + re-debited). */
  heldSpent: number
  /** Points currently credited for the order (earned − revoked). */
  netEarned: number
  hasEarnRow: boolean
}

export type OrderBonusPlan = {
  spendRefund: number
  spendRedebit: number
  earn: number
  earnRevoke: number
}

export type OrderBonusResult = OrderBonusPlan & {
  applied: OrderBonusPlan
  /** Points that could not be debited because the balance was too low. */
  shortfallPoints: number
  /** Final earn computed on payment confirmation (written to Order.bonusEarned). */
  finalEarned: number | null
  skipped?: 'no_user' | 'order_not_found'
}

export class OrderBonusInsufficientError extends Error {
  constructor(public readonly requiredPoints: number, public readonly availablePoints: number) {
    super('bonus_redebit_insufficient')
    this.name = 'OrderBonusInsufficientError'
  }
}

/**
 * Spent points are held while money for the order is (or may still be) received.
 * A confirmed payment wins over a cancellation: a late gateway payment for a cancelled
 * order takes the previously returned points again (or opens a bonus_shortfall).
 */
export function releasesSpentPoints(state: { paymentStatus: string; orderStatus: string }): boolean {
  if (state.paymentStatus === 'failed' || state.paymentStatus === 'refunded') return true
  return state.orderStatus === 'cancelled' && state.paymentStatus !== 'paid'
}

/** Pure: what has to change so the ledger matches the order state. */
export function planOrderBonus(
  state: { paymentStatus: string; orderStatus: string },
  ledger: OrderBonusLedger,
  finalEarned: number | null,
): OrderBonusPlan {
  const targetHeld = releasesSpentPoints(state) ? 0 : ledger.spent
  const spendDelta = targetHeld - ledger.heldSpent
  const plan: OrderBonusPlan = {
    spendRefund: Math.max(0, -spendDelta),
    spendRedebit: Math.max(0, spendDelta),
    earn: 0,
    earnRevoke: 0,
  }
  if (state.paymentStatus === 'refunded') {
    plan.earnRevoke = Math.max(0, ledger.netEarned)
  } else if (state.paymentStatus === 'paid' && !ledger.hasEarnRow && finalEarned !== null && finalEarned > 0) {
    plan.earn = finalEarned
  }
  return plan
}

export async function readOrderBonusLedger(
  tx: Pick<ExtendedTransactionClient, 'bonusTransaction'>,
  orderId: string,
): Promise<OrderBonusLedger> {
  const rows = await tx.bonusTransaction.findMany({
    where: { orderId, type: { in: [...SPEND_TYPES, ...EARN_TYPES] } },
    select: { type: true, points: true },
  })
  let spent = 0
  let heldSpent = 0
  let netEarned = 0
  let hasEarnRow = false
  for (const row of rows) {
    if (row.type === ORDER_BONUS_TX.spend) spent += -row.points
    if (SPEND_TYPES.includes(row.type)) heldSpent += -row.points
    if (EARN_TYPES.includes(row.type)) netEarned += row.points
    if (row.type === ORDER_BONUS_TX.earn) hasEarnRow = true
  }
  return { spent: Math.max(0, spent), heldSpent, netEarned, hasEarnRow }
}

/** Locks the order's customer row. Call right after the Order lock, before Product locks. */
export async function lockOrderBonusUser(tx: ExtendedTransactionClient, userId: string | null | undefined): Promise<void> {
  if (!userId) return
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`
}

async function orderStatusOf(tx: ExtendedTransactionClient, orderId: string): Promise<string> {
  const row = await tx.orderStatusRecord.findUnique({ where: { orderId }, select: { status: true } })
  return row?.status ?? 'pending'
}

async function computeFinalEarned(
  tx: ExtendedTransactionClient,
  order: { items: unknown; subtotal: unknown; total: unknown; delivery: unknown },
): Promise<number> {
  const items = Array.isArray(order.items)
    ? (order.items as Array<{ id?: unknown; price?: unknown; quantity?: unknown }>)
    : []
  const ids = [...new Set(items.flatMap((item) => typeof item.id === 'string' ? [item.id] : []))]
  const rates = ids.length > 0
    ? await tx.product.findMany({ where: { id: { in: ids } }, select: { id: true, bonusRate: true } })
    : []
  const rateById = new Map(rates.map((row) => [row.id, typeof row.bonusRate === 'number' ? row.bonusRate : 0]))
  const config = await getBonusProgramConfig(tx)
  return calcEarnedPointsForPayment({
    items: items.map((item) => ({
      price: Number(item.price) || 0,
      quantity: Number(item.quantity) || 0,
      bonusRate: typeof item.id === 'string' ? rateById.get(item.id) ?? 0 : 0,
    })),
    goodsSubtotal: toNum(order.subtotal as number),
    total: toNum(order.total as number),
    delivery: toNum(order.delivery as number),
    config,
  })
}

async function credit(
  tx: ExtendedTransactionClient,
  input: { userId: string; orderId: string; type: string; points: number; actorUserId?: string; reason: string },
): Promise<void> {
  const expiryDays = await getBonusExpiryDays(tx)
  const user = await tx.user.update({
    where: { id: input.userId },
    data: { bonusPoints: { increment: input.points } },
    select: { bonusPoints: true },
  })
  await tx.bonusTransaction.create({
    data: {
      userId: input.userId,
      orderId: input.orderId,
      type: input.type,
      points: input.points,
      balanceAfter: user.bonusPoints,
      remainingPoints: input.points,
      expiresAt: bonusExpiryDate(expiryDays),
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
    },
  })
}

/** All-or-nothing debit. Returns false (and writes nothing) when the balance is too low. */
async function debit(
  tx: ExtendedTransactionClient,
  input: { userId: string; orderId: string; type: string; points: number; actorUserId?: string; reason: string },
): Promise<boolean> {
  const balance = await expireBonusPoints(tx, input.userId)
  if (balance < input.points) return false
  const taken = await tx.user.updateMany({
    where: { id: input.userId, bonusPoints: { gte: input.points } },
    data: { bonusPoints: { decrement: input.points } },
  })
  if (taken.count !== 1) return false
  await consumeBonusLots(tx, input.userId, input.points)
  await tx.bonusTransaction.create({
    data: {
      userId: input.userId,
      orderId: input.orderId,
      type: input.type,
      points: -input.points,
      balanceAfter: balance - input.points,
      actorUserId: input.actorUserId ?? null,
      reason: input.reason,
    },
  })
  return true
}

async function recordShortfall(
  tx: ExtendedTransactionClient,
  orderId: string,
  shortfallPoints: number,
  actorUserId: string | undefined,
): Promise<void> {
  const now = new Date()
  if (shortfallPoints > 0) {
    await tx.orderOperationalException.upsert({
      where: { orderId_code: { orderId, code: ORDER_BONUS_SHORTFALL } },
      create: { orderId, code: ORDER_BONUS_SHORTFALL, productIds: [] },
      update: { status: 'open', lastSeenAt: now, occurrences: { increment: 1 }, resolvedAt: null, resolvedBy: null },
    })
    return
  }
  await tx.orderOperationalException.updateMany({
    where: { orderId, code: ORDER_BONUS_SHORTFALL, status: 'open' },
    data: { status: 'resolved', resolvedAt: now, resolvedBy: actorUserId ?? 'system', lastSeenAt: now },
  })
}

const EMPTY_PLAN: OrderBonusPlan = { spendRefund: 0, spendRedebit: 0, earn: 0, earnRevoke: 0 }

/**
 * Brings the order's bonus ledger in line with its current payment and order status.
 * Must run inside the transaction that changed the state, after the Order row lock.
 * `requireFullDebit` turns a shortfall into OrderBonusInsufficientError (the caller's
 * transaction then rolls back) — used to block restoring a cancelled order.
 */
export async function reconcileOrderBonus(
  tx: ExtendedTransactionClient,
  orderId: string,
  options: { trigger: OrderBonusTrigger; actorUserId?: string; orderStatus?: string; requireFullDebit?: boolean },
): Promise<OrderBonusResult> {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, userId: true, paymentStatus: true, bonusEarned: true, items: true, subtotal: true, total: true, delivery: true },
  })
  const empty = { ...EMPTY_PLAN, applied: { ...EMPTY_PLAN }, shortfallPoints: 0, finalEarned: null }
  if (!order) return { ...empty, skipped: 'order_not_found' }
  if (!order.userId) return { ...empty, skipped: 'no_user' }
  const userId = order.userId

  await lockOrderBonusUser(tx, userId)
  if (!await tx.user.findUnique({ where: { id: userId }, select: { id: true } })) return { ...empty, skipped: 'no_user' }
  const orderStatus = options.orderStatus ?? await orderStatusOf(tx, orderId)
  const ledger = await readOrderBonusLedger(tx, orderId)

  // Earning is decided exactly once: on the payment confirmation event, for checkout
  // orders (non-null forecast) without any earlier order_earn row (incl. historical ones).
  const decideEarn = options.trigger === 'payment_confirmed'
    && order.paymentStatus === 'paid'
    && !ledger.hasEarnRow
    && order.bonusEarned !== null
  const finalEarned = decideEarn ? await computeFinalEarned(tx, order) : null

  const plan = planOrderBonus({ paymentStatus: order.paymentStatus, orderStatus }, ledger, finalEarned)
  const applied: OrderBonusPlan = { ...EMPTY_PLAN }
  const reason = `Order ${orderId}: ${options.trigger}`
  const base = { userId, orderId, actorUserId: options.actorUserId, reason }

  // Credits first: a refund in the same step can cover a revoke.
  if (plan.spendRefund > 0) {
    await credit(tx, { ...base, type: ORDER_BONUS_TX.spendRefund, points: plan.spendRefund })
    applied.spendRefund = plan.spendRefund
  }
  if (plan.earn > 0) {
    await credit(tx, { ...base, type: ORDER_BONUS_TX.earn, points: plan.earn })
    applied.earn = plan.earn
  }
  if (finalEarned !== null) {
    await tx.order.update({ where: { id: orderId }, data: { bonusEarned: finalEarned } })
  }

  let shortfallPoints = 0
  if (plan.earnRevoke > 0) {
    if (await debit(tx, { ...base, type: ORDER_BONUS_TX.earnRevoke, points: plan.earnRevoke })) applied.earnRevoke = plan.earnRevoke
    else shortfallPoints += plan.earnRevoke
  }
  if (plan.spendRedebit > 0) {
    if (await debit(tx, { ...base, type: ORDER_BONUS_TX.spendRedebit, points: plan.spendRedebit })) applied.spendRedebit = plan.spendRedebit
    else shortfallPoints += plan.spendRedebit
  }

  if (shortfallPoints > 0 && options.requireFullDebit) {
    const balance = (await tx.user.findUnique({ where: { id: userId }, select: { bonusPoints: true } }))?.bonusPoints ?? 0
    throw new OrderBonusInsufficientError(shortfallPoints, balance)
  }
  await recordShortfall(tx, orderId, shortfallPoints, options.actorUserId)

  return { ...plan, applied, shortfallPoints, finalEarned }
}

/** Read-only: points still missing for orders with an open bonus shortfall, plus balances. */
export async function readOrderBonusShortfalls(
  tx: Pick<ExtendedTransactionClient, 'order' | 'orderStatusRecord' | 'bonusTransaction' | 'user'>,
  orderIds: readonly string[],
): Promise<Map<string, { shortfallPoints: number; availablePoints: number }>> {
  const result = new Map<string, { shortfallPoints: number; availablePoints: number }>()
  if (orderIds.length === 0) return result
  const [orders, statuses] = await Promise.all([
    tx.order.findMany({ where: { id: { in: [...orderIds] } }, select: { id: true, userId: true, paymentStatus: true } }),
    tx.orderStatusRecord.findMany({ where: { orderId: { in: [...orderIds] } }, select: { orderId: true, status: true } }),
  ])
  const statusById = new Map(statuses.map((row) => [row.orderId, row.status]))
  const userIds = [...new Set(orders.flatMap((order) => order.userId ? [order.userId] : []))]
  const users = userIds.length > 0
    ? await tx.user.findMany({ where: { id: { in: userIds } }, select: { id: true, bonusPoints: true } })
    : []
  const balanceById = new Map(users.map((user) => [user.id, user.bonusPoints]))
  for (const order of orders) {
    const ledger = await readOrderBonusLedger(tx, order.id)
    const plan = planOrderBonus({ paymentStatus: order.paymentStatus, orderStatus: statusById.get(order.id) ?? 'pending' }, ledger, null)
    result.set(order.id, {
      shortfallPoints: plan.earnRevoke + plan.spendRedebit,
      availablePoints: order.userId ? balanceById.get(order.userId) ?? 0 : 0,
    })
  }
  return result
}
