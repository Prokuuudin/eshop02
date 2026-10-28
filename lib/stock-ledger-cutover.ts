import { createHash } from 'crypto'

export interface CutoverProduct {
  id: string
  externalId: string | null
  stock: number
  grinsStock: number | null
  isDeleted: boolean
}

export interface CutoverOrder {
  id: string
  createdAt: Date
  paymentStatus: string
  stockReservationStatus: string
  items: unknown
}

export interface StockLedgerCutoverReport {
  readOnly: true
  databaseWrites: 0
  fingerprint: string
  checkoutClosed: boolean
  linkedProducts: number
  initializedProducts: number
  negativeAvailability: number
  negativePhysicalStock: number
  existingAllocations: number
  candidateOpenOrders: Array<{
    id: string
    createdAt: string
    paymentStatus: string
    reservationStatus: string
    items: Array<{ productId: string; quantity: number }>
  }>
  gate: 'NO_OPEN_ORDER_BACKFILL_REQUIRED' | 'REVIEW_EACH_ORDER_AND_BUILD_AN_EXPLICIT_UNPOSTED_ORDER_ALLOWLIST'
}

export function buildStockLedgerCutoverReport(
  products: readonly CutoverProduct[],
  orders: readonly CutoverOrder[],
  allocationCount: number,
  checkoutClosed: boolean,
): StockLedgerCutoverReport {
  const candidateOpenOrders = orders.map((order) => ({
    id: order.id,
    createdAt: order.createdAt.toISOString(),
    paymentStatus: order.paymentStatus,
    reservationStatus: order.stockReservationStatus,
    items: (Array.isArray(order.items) ? order.items : []).flatMap((item: unknown) => {
      const row = item as { id?: unknown; quantity?: unknown }
      return typeof row.id === 'string' && Number.isSafeInteger(row.quantity) && Number(row.quantity) > 0
        ? [{ productId: row.id, quantity: Number(row.quantity) }]
        : []
    }),
  }))
  const fingerprint = createHash('sha256').update(JSON.stringify({
    products: products.map((row) => [row.id, row.externalId, row.stock, row.grinsStock, row.isDeleted]),
    orders: candidateOpenOrders,
    allocations: allocationCount,
  })).digest('hex')

  return {
    readOnly: true as const,
    databaseWrites: 0 as const,
    fingerprint,
    checkoutClosed,
    linkedProducts: products.length,
    initializedProducts: products.filter((row) => row.grinsStock !== null).length,
    negativeAvailability: products.filter((row) => row.stock < 0).length,
    negativePhysicalStock: products.filter((row) => row.grinsStock !== null && row.grinsStock < 0).length,
    existingAllocations: allocationCount,
    candidateOpenOrders,
    gate: candidateOpenOrders.length === 0
      ? 'NO_OPEN_ORDER_BACKFILL_REQUIRED' as const
      : 'REVIEW_EACH_ORDER_AND_BUILD_AN_EXPLICIT_UNPOSTED_ORDER_ALLOWLIST' as const,
  }
}
