import { assertGrinsCheckoutOpen } from './grins-import-maintenance'
import { validateOrderDelivery } from './validate-order-delivery'
import { Prisma } from '@/generated/prisma/client'
import { calcDeliveryFee } from './delivery'
import { getShippingSettings } from './shipping-settings-server'
import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import type { Order as PrismaOrder } from '@/generated/prisma/client'
import type { ServerUser } from '@/lib/server-auth'
import { toNum } from '@/lib/decimal'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { extractVat, isOrderTaxIncluded } from '@/lib/tax'
import { appendServerAudit } from '@/lib/server-audit'
import { bonusExpiryDate, consumeBonusLots, expireBonusPoints, getBonusExpiryDays } from '@/lib/bonus-ledger'
import { pointsToEuros } from '@/lib/bonus-program'
import type { AdminOrderUpdateInput, PrepareOrder, ServerOrder, ServerOrderItem, ServerPaymentStatus } from '@/lib/orders-data-types'
import { AdminOrderUpdateError, ExistingCheckoutOrderError, InsufficientBonusPointsError, InsufficientStockError, PromoCodeUsageLimitError } from '@/lib/orders-data-types'
import { buildOrderData, buildOrderItemSnapshot, mapDbToServerOrder } from '@/lib/orders-data-mapping'
import {
  adjustOrderStock,
  assertNoAwaitingAllocation,
  commitOrderAllocations,
  holdOrderStock,
  releaseOrderStock,
  StockLedgerError,
  tryHoldOrderStock,
} from '@/lib/stock-ledger'
import { logOperationalEvent } from '@/lib/observability'
import {
  enqueueAdminOrderNotification,
  type AdminOrderNotificationSource,
} from '@/lib/order-admin-notification-outbox'

export type { AdminOrderUpdateInput, PrepareOrder, ServerOrder, ServerOrderItem, ServerOrderLegalDetails, ServerPaymentStatus } from '@/lib/orders-data-types'
export { AdminOrderUpdateError, ExistingCheckoutOrderError, InsufficientBonusPointsError, InsufficientStockError, PromoCodeUsageLimitError } from '@/lib/orders-data-types'

// Order ids are sequential — never expose or mutate another customer's order (PII / IDOR).
// Admin, the order's own account (userId), or a legacy/guest order's matching email may access it.
export function canAccessOrder(
  order: Pick<ServerOrder, 'userId' | 'email'>,
  caller: ServerUser | null
): boolean {
  if (!caller) return false
  if (caller.platformRole === 'admin') return true
  if (order.userId) return order.userId === caller.id
  return !!caller.email && !!order.email && caller.email.toLowerCase() === order.email.toLowerCase()
}

export type CreateOrderOptions = {
  /**
   * Staff-entered sale (admin manual order): the admin typed every unit price, so the
   * customer sellability rule (active + valid ERP B2B price) is not applied — only
   * existence and stock are. Never set this for customer-initiated orders.
   */
  staffPricedSale?: boolean
  /** Safe routing metadata persisted with the transactional admin-email outbox event. */
  notificationSource?: AdminOrderNotificationSource
  notificationCorrelationId?: string
}

/** Create the order row plus its side effects (stock, promo usage, bonus balance) atomically. */
const createOrderWithSideEffects = async (id: string, initialOrder: Omit<ServerOrder, 'id'>, prepare?: PrepareOrder, options: CreateOrderOptions = {}): Promise<PrismaOrder> => {
  await assertGrinsCheckoutOpen(prisma)
  return prisma.$transaction(async (tx) => {
    await assertGrinsCheckoutOpen(tx, true)
    if (initialOrder.userId) await expireBonusPoints(tx, initialOrder.userId)
    const currentUser = initialOrder.userId
      ? await tx.user.findUnique({ where: { id: initialOrder.userId }, select: { bonusPoints: true } })
      : null
    const order = prepare ? await prepare(tx, currentUser?.bonusPoints ?? null) : initialOrder
    const spent = Math.max(0, Math.round(order.bonusSpent ?? 0))

    // The balance used for pricing and the conditional debit live in this transaction.
    // If another checkout spends the same points first, this update matches zero rows and
    // the entire order (including its discounted total) is rolled back.
    if (order.userId && spent > 0) {
      const debit = await tx.user.updateMany({
        where: { id: order.userId, bonusPoints: { gte: spent } },
        data: { bonusPoints: { decrement: spent } },
      })
      if (debit.count !== 1) throw new InsufficientBonusPointsError()
      await consumeBonusLots(tx, order.userId, spent)
    }

    const data = buildOrderData(order)
    const created = await tx.order.create({ data: { id, ...data } })

    if (order.userId && spent > 0) {
      await tx.bonusTransaction.create({
        data: {
          userId: order.userId,
          orderId: created.id,
          type: 'order_spend',
          points: -spent,
          balanceAfter: (currentUser?.bonusPoints ?? spent) - spent,
          reason: `Order ${created.id}`,
        },
      })
    }

    // Decrement stock for each item. updateMany's where clause is the actual guard — if
    // it matches 0 rows the product is missing, deleted, inactive, has no valid B2B price
    // (customer orders) or doesn't have enough stock. That must fail the whole order,
    // not silently create it with unaccounted-for items.
    try {
      await holdOrderStock(tx, {
        orderId: created.id,
        items: order.items,
        status: order.stockReservationStatus === 'reserved' ? 'reserved' : 'committed',
        eventPrefix: `order:${created.id}:created`,
        customerSellability: !options.staffPricedSale,
      })
    } catch (error) {
      if (error instanceof StockLedgerError && error.code === 'insufficient_stock') {
        throw new InsufficientStockError(error.productIds)
      }
      throw error
    }

    // Atomically reserve a promo use. The pricing lookup happens in this same
    // transaction, but this conditional update is the concurrency guard: only
    // one checkout can claim the final available use.
    if (order.promoCode) {
      const promoUse = await tx.promoCode.updateMany({
        where: {
          code: order.promoCode.toUpperCase(),
          active: true,
          OR: [{ maxUses: null }, { usedCount: { lt: tx.promoCode.fields.maxUses } }],
        },
        data: { usedCount: { increment: 1 } },
      })
      if (promoUse.count !== 1) throw new PromoCodeUsageLimitError()
      const promo = await tx.promoCode.findFirst({
        where: { code: order.promoCode.toUpperCase(), active: true },
        select: { id: true, perUserLimit: true },
      })
      if (!promo) throw new PromoCodeUsageLimitError()
      if (promo.perUserLimit) {
        const identity = order.userId ? { userId: order.userId } : { email: order.email.toLowerCase() }
        const priorUses = await tx.promoCodeRedemption.count({ where: { promoCodeId: promo.id, ...identity } })
        if (priorUses >= promo.perUserLimit) throw new PromoCodeUsageLimitError()
      }
      await tx.promoCodeRedemption.create({ data: {
        promoCodeId: promo.id,
        orderId: created.id,
        userId: order.userId ?? null,
        email: order.email.toLowerCase(),
        discount: order.discount,
      } })
    }

    // Credit earned points separately after the guarded debit.
    const earned = Math.max(0, Math.round(order.bonusEarned ?? 0))
    if (order.userId && earned > 0) {
      const expiryDays = await getBonusExpiryDays(tx)
      await tx.user.updateMany({
        where: { id: order.userId },
        data: { bonusPoints: { increment: earned } },
      })
      await tx.bonusTransaction.create({
        data: {
          userId: order.userId,
          orderId: created.id,
          type: 'order_earn',
          points: earned,
          balanceAfter: (currentUser?.bonusPoints ?? 0) - spent + earned,
          remainingPoints: earned,
          expiresAt: bonusExpiryDate(expiryDays),
          reason: `Order ${created.id}`,
        },
      })
    }

    await enqueueAdminOrderNotification(tx, {
      orderId: created.id,
      source: options.notificationSource ?? 'checkout',
      correlationId: options.notificationCorrelationId,
    })

    return created
  })
}

const isUniqueConflict = (e: unknown): boolean =>
  typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002'

/** Next sequential order id: max existing numeric id + 1 (starting from 1001). */
const generateNextOrderId = async (): Promise<string> => {
  const rows = await prisma.$queryRaw<Array<{ max: bigint | number | null }>>`
    SELECT MAX(CAST(id AS BIGINT)) AS max FROM "Order" WHERE id ~ '^[0-9]+$'
  `
  const max = rows[0]?.max
  const maxNum = max == null ? 1000 : Number(max)
  return String(Math.max(maxNum, 1000) + 1)
}

/**
 * Create a new order under a server-generated id. The id is never taken from the client:
 * per-browser counters collide across customers and would silently overwrite foreign orders.
 * A concurrent insert can win the generated id — retry with a fresh one.
 */
export const createServerOrder = async (order: Omit<ServerOrder, 'id'>, prepare?: PrepareOrder, options: CreateOrderOptions = {}): Promise<ServerOrder> => {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = await generateNextOrderId()
    try {
      const row = await createOrderWithSideEffects(id, order, prepare, options)
      return mapDbToServerOrder(row)
    } catch (e) {
      if (!isUniqueConflict(e)) throw e
      if (order.checkoutKey) {
        const existing = await prisma.order.findUnique({ where: { checkoutKey: order.checkoutKey } })
        if (existing) throw new ExistingCheckoutOrderError(mapDbToServerOrder(existing))
      }
      lastError = e
    }
  }
  throw lastError
}

/** Upsert by a caller-supplied id — used by the key-protected v1 API, not the public checkout. */
export const createOrUpdateServerOrder = async (order: ServerOrder): Promise<ServerOrder> => {
  const existing = await prisma.order.findUnique({ where: { id: order.id } })

  const row = existing
    ? await prisma.order.update({ where: { id: order.id }, data: buildOrderData(order) })
    : await createOrderWithSideEffects(order.id, order)

  return mapDbToServerOrder(row)
}

export const getServerOrderById = async (orderId: string): Promise<ServerOrder | null> => {
  const row = await prisma.order.findUnique({ where: { id: orderId } })
  return row ? mapDbToServerOrder(row) : null
}

type ReservationTx = ExtendedTransactionClient

async function releaseReservation(
  tx: ReservationTx,
  orderId: string,
  extraWhere: { stockReservedUntil?: { lte: Date } } = {},
): Promise<boolean> {
  // The expired scan is only a candidate list. Admin edits can change items while
  // a cleaner waits, so acquire the same Order lock as edit/payment, then reread.
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
  const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, items: true } })
  if (!order) return false
  const released = await tx.order.updateMany({
    where: { id: orderId, stockReservationStatus: 'reserved', ...extraWhere },
    data: { stockReservationStatus: 'released', stockReleasedAt: new Date(), stockReservedUntil: null },
  })
  if (released.count !== 1) return false

  await releaseOrderStock(tx, {
    orderId: order.id,
    items: order.items as ServerOrderItem[],
    reason: extraWhere.stockReservedUntil ? 'expired' : 'failed',
    reservedOnly: true,
  })
  return true
}

export async function applyOrderReservationPaymentState(
  tx: ReservationTx,
  orderId: string,
  paymentStatus: ServerPaymentStatus,
): Promise<{ latePaymentStockUnavailable: boolean; productIds: string[] }> {
  const unchanged = { latePaymentStockUnavailable: false, productIds: [] as string[] }
  if (paymentStatus === 'paid') {
    const committed = await tx.order.updateMany({
      where: { id: orderId, stockReservationStatus: 'reserved' },
      data: { stockReservationStatus: 'committed', stockReservedUntil: null },
    })
    if (committed.count === 1) {
      await commitOrderAllocations(tx, orderId)
      return unchanged
    }
    const order = await tx.order.findUnique({
      where: { id: orderId },
      select: { id: true, items: true, stockReservationStatus: true },
    })
    if (!order || order.stockReservationStatus === 'committed') return unchanged
    if (order.stockReservationStatus === 'released') {
      const hold = await tryHoldOrderStock(tx, {
        orderId,
        items: order.items as ServerOrderItem[],
        status: 'committed',
        eventPrefix: `order:${orderId}:late-payment`,
      })
      if (!hold.held) return { latePaymentStockUnavailable: true, productIds: hold.insufficientProductIds }
      const reacquired = await tx.order.updateMany({
        where: { id: orderId, stockReservationStatus: 'released' },
        data: { stockReservationStatus: 'committed', stockReservedUntil: null, stockReleasedAt: null },
      })
      if (reacquired.count !== 1) throw new Error('late_payment_order_state_changed')
      return unchanged
    }
    return unchanged
  }
  if (paymentStatus === 'failed') {
    await releaseReservation(tx, orderId)
  }
  return unchanged
}

/** Opportunistic cleanup; the conditional transition makes concurrent cleaners idempotent. */
export async function releaseExpiredStockReservations(now = new Date()): Promise<number> {
  const expired = await prisma.order.findMany({
    where: { stockReservationStatus: 'reserved', stockReservedUntil: { lte: now } },
    select: { id: true },
    take: 50,
  })
  let count = 0
  for (const order of expired) {
    const released = await prisma.$transaction((tx) =>
      releaseReservation(tx, order.id, { stockReservedUntil: { lte: now } }))
    if (released) count += 1
  }
  return count
}

export const updateServerOrderPayment = async (
  orderId: string,
  updates: Partial<Pick<ServerOrder, 'paymentStatus' | 'paymentProvider' | 'paymentSessionId'>>,
  evidence?: { sessionId: string; amount?: number; amountPaid?: number; currency?: string },
): Promise<ServerOrder | null> => {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
    const existing = await tx.order.findUnique({ where: { id: orderId } })
    if (!existing) return { row: null, latePaymentStockUnavailable: false, productIds: [] as string[] }
    if (updates.paymentProvider === 'paysera') {
      if (!evidence?.sessionId || existing.paymentMethod !== 'paysera' || evidence.sessionId !== existing.paymentSessionId) {
        throw new Error('invalid_payment_session')
      }
      if (updates.paymentStatus === 'paid' && (evidence.currency !== 'EUR'
        || evidence.amount !== Math.round(toNum(existing.total) * 100)
        || evidence.amountPaid !== evidence.amount)) throw new Error('invalid_payment_amount')
    }
    // `paid` is terminal: a duplicate verified callback is idempotent and a delayed
    // cancel/failure/expiry must never downgrade it or release its committed stock.
    if (existing.paymentStatus === 'paid') {
      return { row: existing, latePaymentStockUnavailable: false, productIds: [] as string[] }
    }
    // A verified payment that arrives after the reservation expired is still recorded
    // as paid (approved Stock Ledger semantics). applyOrderReservationPaymentState
    // re-holds the stock or reports late_payment_stock_unavailable for staff.
    let reservation = { latePaymentStockUnavailable: false, productIds: [] as string[] }
    if (updates.paymentStatus) {
      reservation = await applyOrderReservationPaymentState(tx, orderId, updates.paymentStatus)
    }
    const row = await tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: updates.paymentStatus ?? undefined,
        paymentProvider: updates.paymentProvider ?? undefined,
        paymentSessionId: updates.paymentSessionId ?? undefined,
      },
    })
    if (reservation.latePaymentStockUnavailable) {
      await tx.orderOperationalException.upsert({
        where: { orderId_code: { orderId, code: 'late_payment_stock_unavailable' } },
        create: {
          orderId,
          code: 'late_payment_stock_unavailable',
          productIds: reservation.productIds,
          paymentProvider: updates.paymentProvider ?? existing.paymentProvider,
        },
        update: {
          lastSeenAt: new Date(),
          occurrences: { increment: 1 },
          productIds: reservation.productIds,
          paymentProvider: updates.paymentProvider ?? existing.paymentProvider,
        },
      })
    }
    return { row, ...reservation }
  })

  if (result.latePaymentStockUnavailable) {
    logOperationalEvent({
      event: 'late_payment_stock_unavailable',
      level: 'error',
      alert: true,
      orderId,
      productIds: result.productIds,
    })
  }
  return result.row ? mapDbToServerOrder(result.row) : null
}

/** Serialize gateway creation with admin edits, callbacks and reservation release. */
export async function createOrderPaymentSession(
  orderId: string,
  create: (order: ServerOrder) => Promise<{ payseraOrderId: string; paymentUrl?: string; paidEvidence?: { sessionId: string; amount: number; amountPaid: number; currency: string } }>,
): Promise<{ payseraOrderId: string; paymentUrl?: string; paidEvidence?: { sessionId: string; amount: number; amountPaid: number; currency: string }; order: ServerOrder }> {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
    const row = await tx.order.findUnique({ where: { id: orderId } })
    if (!row || row.paymentStatus === 'paid' || row.paymentMethod !== 'paysera') throw new Error('order_not_payable')
    if (!['reserved', 'committed'].includes(row.stockReservationStatus)
      || (row.stockReservationStatus === 'reserved' && (!row.stockReservedUntil || row.stockReservedUntil <= new Date()))) throw new Error('stock_reservation_expired')
    const payment = await create(mapDbToServerOrder(row))
    // A retry may reuse the stored Paysera order or create its first session, but it
    // must never replace an in-flight session. The paid webhook is bound to this id.
    if (row.paymentSessionId && payment.payseraOrderId !== row.paymentSessionId) {
      throw new Error('payment_session_conflict')
    }
    // The gateway call may outlive the reservation; do not expose that link.
    if (!payment.paidEvidence && row.stockReservationStatus === 'reserved'
      && (!row.stockReservedUntil || row.stockReservedUntil <= new Date())) throw new Error('stock_reservation_expired')
    await tx.order.update({ where: { id: orderId }, data: { paymentSessionId: payment.payseraOrderId } })
    return { ...payment, order: { ...mapDbToServerOrder(row), paymentSessionId: payment.payseraOrderId } }
  }, { timeout: 20_000 })
}

/**
 * Admin order editing is a single database transaction: lock the order, rebuild item
 * snapshots from authoritative catalog prices, apply the stock delta, update totals and
 * append the audit record. Client-calculated totals are deliberately not accepted.
 */
export async function updateServerOrderByAdmin(
  orderId: string,
  input: AdminOrderUpdateInput,
  admin: ServerUser,
  request: NextRequest,
): Promise<ServerOrder> {
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
    const current = await tx.order.findUnique({ where: { id: orderId } })
    if (!current) throw new AdminOrderUpdateError('Order not found', 'not_found')
    if (current.paymentStatus === 'paid') {
      throw new AdminOrderUpdateError('Paid orders require a refund/adjustment workflow', 'paid_order')
    }
    if (current.stockReservationStatus === 'released') {
      throw new AdminOrderUpdateError('Released stock reservation cannot be edited', 'released_stock')
    }
    try {
      await assertNoAwaitingAllocation(tx, orderId)
    } catch (error) {
      if (error instanceof StockLedgerError && error.code === 'awaiting_grins_sync') {
        throw new AdminOrderUpdateError('Order has stock awaiting a fresh GrinS snapshot', 'awaiting_grins_sync')
      }
      throw error
    }

    const requestedIds = [...new Set(input.items.map((item) => item.id))]
    const products = await tx.product.findMany({
      where: { id: { in: requestedIds }, isDeleted: false, isActive: true },
    })
    const byId = new Map(products.map((product) => [product.id, product]))
    if (products.length !== requestedIds.length) {
      throw new AdminOrderUpdateError('One or more products are unavailable', 'invalid_item')
    }

    const currentItems = current.items as ServerOrderItem[]
    try {
      await adjustOrderStock(tx, {
        orderId,
        oldItems: currentItems,
        newItems: input.items,
        allocationStatus: current.stockReservationStatus === 'reserved' ? 'reserved' : 'committed',
        customerSellability: false,
      })
    } catch (error) {
      if (error instanceof StockLedgerError && error.code === 'insufficient_stock') {
        throw new AdminOrderUpdateError(`Insufficient stock for ${error.productIds.join(', ')}`, 'insufficient_stock')
      }
      throw error
    }

    const items: ServerOrderItem[] = input.items.map((item) => {
      const product = byId.get(item.id)!
      return buildOrderItemSnapshot(product, {
        quantity: item.quantity,
        price: toNum(product.price),
        lineKey: item.lineKey,
        variantLabel: item.variantLabel,
      })
    })

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
    const oldSubtotal = toNum(current.subtotal)
    const oldDiscount = toNum(current.discount)
    // Manual/campaign discounts have no promoCode; a destination-only edit must
    // retain their economic value just as it retains a promo discount.
    const discountRate = oldSubtotal > 0 ? oldDiscount / oldSubtotal : 0
    const discount = Math.round(subtotal * discountRate * 100) / 100
    const shippingSettings = await getShippingSettings(tx)
    let destination: ReturnType<typeof validateOrderDelivery>
    try {
      destination = validateOrderDelivery({ ...input, country: input.country ?? current.country }, shippingSettings, { existingMethod: current.deliveryMethod })
    } catch (error) {
      throw new AdminOrderUpdateError(error instanceof Error ? error.message : 'Invalid destination', 'invalid_item')
    }
    const { country, deliveryLocation } = destination
    const delivery = calcDeliveryFee(input.deliveryMethod, subtotal - discount, country, shippingSettings)
    const currentTotals = {
      subtotal: oldSubtotal,
      discount: oldDiscount,
      delivery: toNum(current.delivery),
      tax: toNum(current.tax),
      total: toNum(current.total),
      bonusSpent: current.bonusSpent ?? undefined,
    }
    const taxIncluded = isOrderTaxIncluded(currentTotals)
    const tax = taxIncluded ? extractVat(subtotal - discount) : toNum(current.tax)
    const bonusSpent = current.bonusSpent ?? 0
    // bonusSpent is persisted in points (100 points = EUR 1), not in euros.
    // Subtracting the raw point count made edited orders commonly collapse to EUR 0.00.
    const total = Math.max(0, Math.round((subtotal - discount + delivery - pointsToEuros(bonusSpent) + (taxIncluded ? 0 : tax)) * 100) / 100)

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        items,
        subtotal,
        discount,
        delivery,
        tax,
        total,
        deliveryMethod: input.deliveryMethod,
        address: destination.address,
        city: destination.city,
        pickupStoreId: destination.pickupStoreId ?? null,
        country,
        deliveryLocation: deliveryLocation ?? Prisma.DbNull,
        postalCode: destination.postalCode ?? null,
        // Every edit invalidates the old session, including equal-total item changes.
        paymentSessionId: null,
      },
    })

    await appendServerAudit(tx, request, admin, {
        action: 'order.updated', entityType: 'order', entityId: orderId,
        entityTitle: `${current.firstName} ${current.lastName}`.trim(),
        before: { items: current.items, subtotal: oldSubtotal, total: toNum(current.total), address: current.address },
        after: { items, subtotal, total, address: input.address },
    })
    return updated
  })

  return mapDbToServerOrder(row)
}
