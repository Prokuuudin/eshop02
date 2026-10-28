import type { ExtendedTransactionClient } from '@/lib/prisma'
import type { ServerOrderItem } from '@/lib/orders-data-types'
import { tryHoldOrderStock } from '@/lib/stock-ledger'

export const LATE_PAYMENT_STOCK_UNAVAILABLE = 'late_payment_stock_unavailable'
export const ORDER_STOCK_NOT_COMMITTED = 'order_stock_not_committed'

/**
 * Shipping consumes goods, so it requires stock that nothing can release afterwards.
 * `committed` is never touched by expiry cleanup, payment callbacks or a cancellation
 * from shipped. `reserved` can still expire; `released` holds nothing. Orders created
 * before reservations existed default to `committed` and stay shippable.
 */
export function isStockSecuredForShipment(stockReservationStatus: string): boolean {
  return stockReservationStatus === 'committed'
}

/**
 * Orders among `orderIds` that must not be shipped: a verified late payment could not
 * re-hold their stock. Callers must already hold the Order row locks (FOR UPDATE) so a
 * concurrent late-payment callback, which opens the exception under the same lock, is
 * serialized against the status change.
 */
export async function findOrdersBlockedForShipment(
  tx: ExtendedTransactionClient,
  orderIds: readonly string[],
): Promise<string[]> {
  if (orderIds.length === 0) return []
  const rows = await tx.orderOperationalException.findMany({
    where: { orderId: { in: [...orderIds] }, code: LATE_PAYMENT_STOCK_UNAVAILABLE, status: 'open' },
    select: { orderId: true },
  })
  return [...new Set(rows.map((row) => row.orderId))].sort()
}

export type LatePaymentResolutionResult =
  | { resolved: true; order: { id: string; firstName: string; lastName: string; items: ServerOrderItem[] }; exceptionId: string | null; resolvedAt: Date }
  | { resolved: false; error: 'order_not_found' | 'no_open_exception' | 'order_not_paid' | 'order_stock_not_released' }
  | { resolved: false; error: 'insufficient_stock'; productIds: string[] }

/**
 * Resolves an open late_payment_stock_unavailable exception (or a paid order left released
 * before exceptions were recorded) only by proving that the
 * stock now exists: the whole order is re-held as committed through the Stock Ledger in
 * the same transaction (Order lock first, then sorted Product locks, as the late-payment
 * path does). Nothing is written when any line is still unavailable. There is no
 * resolution path that ships without held stock.
 */
export async function resolveLatePaymentByReholdingStock(
  tx: ExtendedTransactionClient,
  orderId: string,
  adminId: string,
): Promise<LatePaymentResolutionResult> {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${orderId} FOR UPDATE`
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: { id: true, firstName: true, lastName: true, items: true, paymentStatus: true, stockReservationStatus: true },
  })
  if (!order) return { resolved: false, error: 'order_not_found' }
  const exception = await tx.orderOperationalException.findUnique({
    where: { orderId_code: { orderId, code: LATE_PAYMENT_STOCK_UNAVAILABLE } },
    select: { id: true, status: true },
  })
  if (exception && exception.status !== 'open') return { resolved: false, error: 'no_open_exception' }
  if (order.paymentStatus !== 'paid') return { resolved: false, error: 'order_not_paid' }
  if (order.stockReservationStatus !== 'released') return { resolved: false, error: 'order_stock_not_released' }
  // No exception: a paid order left released by code before this release (no exception
  // was recorded then). It gets the same and only path to shipping: a real re-hold.

  const items = order.items as ServerOrderItem[]
  const hold = await tryHoldOrderStock(tx, {
    orderId,
    items,
    status: 'committed',
    eventPrefix: `order:${orderId}:late-payment-resolution`,
    customerSellability: false,
  })
  if (!hold.held) return { resolved: false, error: 'insufficient_stock', productIds: hold.insufficientProductIds }

  const reacquired = await tx.order.updateMany({
    where: { id: orderId, paymentStatus: 'paid', stockReservationStatus: 'released' },
    data: { stockReservationStatus: 'committed', stockReservedUntil: null, stockReleasedAt: null },
  })
  if (reacquired.count !== 1) throw new Error('late_payment_resolution_order_changed')
  const resolvedAt = new Date()
  if (exception) {
    const closed = await tx.orderOperationalException.updateMany({
      where: { id: exception.id, status: 'open' },
      data: { status: 'resolved', resolvedAt, resolvedBy: adminId },
    })
    if (closed.count !== 1) throw new Error('late_payment_resolution_exception_changed')
  }
  return { resolved: true, order: { id: order.id, firstName: order.firstName, lastName: order.lastName, items }, exceptionId: exception?.id ?? null, resolvedAt }
}
