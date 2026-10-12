import { createHash, randomUUID } from 'crypto'
import { Prisma } from '@/generated/prisma/client'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import type { ServerOrderItem } from '@/lib/orders-data-types'
import { PURCHASABLE_PRODUCT_WHERE } from '@/lib/product-sellability'
import { stockLedgerFlags } from './stock-ledger-config'

export const ACTIVE_ALLOCATION_STATUSES = ['reserved', 'committed', 'awaiting_grins_sync'] as const
export const MUTABLE_ALLOCATION_STATUSES = ['reserved', 'committed'] as const
export type AllocationStatus = typeof ACTIVE_ALLOCATION_STATUSES[number] | 'released' | 'reconciled'

type Tx = ExtendedTransactionClient
type ItemQuantity = Pick<ServerOrderItem, 'id' | 'quantity'>

export class StockLedgerError extends Error {
  constructor(public readonly code: 'insufficient_stock' | 'awaiting_grins_sync' | 'ledger_product_not_initialized' | 'local_product_not_found', public readonly productIds: string[] = []) {
    super(code)
    this.name = 'StockLedgerError'
  }
}

export function quantitiesByProduct(items: readonly ItemQuantity[]): Map<string, number> {
  const quantities = new Map<string, number>()
  for (const item of items) {
    if (!item.id || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) continue
    quantities.set(item.id, (quantities.get(item.id) ?? 0) + item.quantity)
  }
  return quantities
}

export function stockMutationKey(orderId: string, operation: string, oldItems: readonly ItemQuantity[], newItems: readonly ItemQuantity[]): string {
  const canonical = (items: readonly ItemQuantity[]) => [...quantitiesByProduct(items)].sort(([a], [b]) => a.localeCompare(b))
  const digest = createHash('sha256').update(JSON.stringify([canonical(oldItems), canonical(newItems)])).digest('hex').slice(0, 24)
  return `order:${orderId}:${operation}:${digest}`
}

export async function enterStockLedgerWriteContext(tx: Tx): Promise<void> {
  await tx.$executeRaw`SELECT set_config('hairshop.stock_ledger_write', 'on', true)`
}

export async function lockProducts(tx: Tx, productIds: readonly string[]): Promise<void> {
  const ids = [...new Set(productIds)].sort()
  if (ids.length === 0) return
  await tx.$queryRaw`SELECT id FROM "Product" WHERE id IN (${Prisma.join(ids)}) ORDER BY id FOR UPDATE`
}

export async function recomputeManagedAvailability(tx: Tx, productIds: readonly string[]): Promise<number> {
  const ids = [...new Set(productIds)]
  if (ids.length === 0) return 0
  await enterStockLedgerWriteContext(tx)
  return tx.$executeRaw`
    UPDATE "Product" p
    SET "stock" = GREATEST(
      p."grinsStock" - COALESCE((
        SELECT SUM(a."quantity")::int
        FROM "StockAllocation" a
        WHERE a."productId" = p.id
          AND a.status IN ('reserved', 'committed', 'awaiting_grins_sync')
      ), 0),
      0
    )
    WHERE p.id IN (${Prisma.join(ids)})
      AND p."grinsStock" IS NOT NULL
  `
}

async function productModes(tx: Tx, productIds: readonly string[]): Promise<Map<string, boolean>> {
  const rows = await tx.product.findMany({
    where: { id: { in: [...new Set(productIds)] } },
    select: { id: true, externalId: true, grinsStock: true },
  })
  return new Map(rows.map(row => [row.id, Boolean(row.externalId && row.grinsStock !== null)]))
}

export interface HoldOrderStockInput {
  orderId: string
  items: readonly ItemQuantity[]
  status: 'reserved' | 'committed'
  eventPrefix: string
  customerSellability?: boolean
}

/** Atomically holds availability. Local-only/uninitialised products keep the legacy decrement. */
export async function holdOrderStock(tx: Tx, input: HoldOrderStockInput): Promise<void> {
  const quantities = quantitiesByProduct(input.items)
  const ids = [...quantities.keys()].sort()
  const flags = stockLedgerFlags()
  if (flags.ledgerEnabled) await enterStockLedgerWriteContext(tx)
  const modes = flags.ledgerEnabled ? await productModes(tx, ids) : new Map<string, boolean>()
  const insufficient: string[] = []

  for (const productId of ids) {
    const quantity = quantities.get(productId)!
    const sellability = input.customerSellability === false
      ? { isDeleted: false }
      : PURCHASABLE_PRODUCT_WHERE
    const changed = await tx.product.updateMany({
      where: { id: productId, ...sellability, stock: { gte: quantity } },
      data: { stock: { decrement: quantity } },
    })
    if (changed.count !== 1) {
      insufficient.push(productId)
      continue
    }
    if (modes.get(productId)) {
      await tx.stockAllocation.create({
        data: {
          orderId: input.orderId,
          productId,
          quantity,
          status: input.status,
          eventKey: `${input.eventPrefix}:${productId}`,
        },
      })
    }
  }
  if (insufficient.length > 0) throw new StockLedgerError('insufficient_stock', insufficient)
}

export async function commitOrderAllocations(tx: Tx, orderId: string): Promise<number> {
  if (!stockLedgerFlags().ledgerEnabled) return 0
  return (await tx.stockAllocation.updateMany({
    where: { orderId, status: 'reserved' },
    data: { status: 'committed' },
  })).count
}

async function releaseAllocationQuantity(
  tx: Tx,
  allocation: { id: string; orderId: string; productId: string; quantity: number },
  quantity: number,
  reason: string,
  now: Date,
): Promise<number> {
  const released = Math.min(allocation.quantity, quantity)
  if (released === allocation.quantity) {
    await tx.stockAllocation.update({
      where: { id: allocation.id },
      data: { status: 'released', releasedAt: now, releaseReason: reason },
    })
  } else {
    await tx.stockAllocation.update({ where: { id: allocation.id }, data: { quantity: allocation.quantity - released } })
    await tx.stockAllocation.create({
      data: {
        orderId: allocation.orderId,
        productId: allocation.productId,
        quantity: released,
        status: 'released',
        eventKey: `release:${allocation.id}:${randomUUID()}`,
        releasedAt: now,
        releaseReason: reason,
      },
    })
  }
  return released
}

async function releaseMutableForProduct(
  tx: Tx,
  orderId: string,
  productId: string,
  requested: number,
  reason: string,
  statuses: readonly ('reserved' | 'committed')[] = MUTABLE_ALLOCATION_STATUSES,
): Promise<number> {
  const allocations = await tx.stockAllocation.findMany({
    where: { orderId, productId, status: { in: [...statuses] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, orderId: true, productId: true, quantity: true },
  })
  const now = new Date()
  let remaining = requested
  for (const allocation of allocations) {
    if (remaining <= 0) break
    remaining -= await releaseAllocationQuantity(tx, allocation, remaining, reason, now)
  }
  return requested - remaining
}

export interface ReleaseOrderStockInput {
  orderId: string
  items: readonly ItemQuantity[]
  reason: 'cancelled' | 'returned' | 'failed' | 'expired' | 'edited'
  reservedOnly?: boolean
  includeDeletedLocal?: boolean
  requireLocalProduct?: boolean
}

/** Releases only mutable allocations. AWAITING_GRINS_SYNC is deliberately frozen. */
export async function releaseOrderStock(tx: Tx, input: ReleaseOrderStockInput): Promise<void> {
  const quantities = quantitiesByProduct(input.items)
  const ids = [...quantities.keys()].sort()
  const flags = stockLedgerFlags()
  const modes = flags.ledgerEnabled ? await productModes(tx, ids) : new Map<string, boolean>()
  if (flags.ledgerEnabled) {
    await lockProducts(tx, ids)
    await enterStockLedgerWriteContext(tx)
  }

  for (const productId of ids) {
    const requested = quantities.get(productId)!
    if (modes.get(productId)) {
      await releaseMutableForProduct(
        tx,
        input.orderId,
        productId,
        requested,
        input.reason,
        input.reservedOnly ? ['reserved'] : MUTABLE_ALLOCATION_STATUSES,
      )
      await recomputeManagedAvailability(tx, [productId])
    } else {
      const restored = await tx.product.updateMany({
        where: input.includeDeletedLocal ? { id: productId } : { id: productId, isDeleted: false },
        data: { stock: { increment: requested } },
      })
      if (input.requireLocalProduct && restored.count !== 1) {
        throw new StockLedgerError('local_product_not_found', [productId])
      }
    }
  }
}

export async function assertNoAwaitingAllocation(tx: Tx, orderId: string): Promise<void> {
  if (!stockLedgerFlags().ledgerEnabled) return
  const awaiting = await tx.stockAllocation.findFirst({ where: { orderId, status: 'awaiting_grins_sync' }, select: { id: true } })
  if (awaiting) throw new StockLedgerError('awaiting_grins_sync')
}

export async function adjustOrderStock(
  tx: Tx,
  input: {
    orderId: string
    oldItems: readonly ItemQuantity[]
    newItems: readonly ItemQuantity[]
    allocationStatus: 'reserved' | 'committed'
    customerSellability?: boolean
  },
): Promise<void> {
  const oldQty = quantitiesByProduct(input.oldItems)
  const newQty = quantitiesByProduct(input.newItems)
  const ids = [...new Set([...oldQty.keys(), ...newQty.keys()])].sort()
  const modes = stockLedgerFlags().ledgerEnabled ? await productModes(tx, ids) : new Map<string, boolean>()
  const eventPrefix = `${stockMutationKey(input.orderId, 'edit', input.oldItems, input.newItems)}:${randomUUID()}`
  if (stockLedgerFlags().ledgerEnabled) {
    await lockProducts(tx, ids)
    await enterStockLedgerWriteContext(tx)
  }

  for (const productId of ids) {
    const delta = (newQty.get(productId) ?? 0) - (oldQty.get(productId) ?? 0)
    if (delta === 0) continue
    if (delta > 0) {
      await holdOrderStock(tx, {
        orderId: input.orderId,
        items: [{ id: productId, quantity: delta }],
        status: input.allocationStatus,
        eventPrefix,
        customerSellability: input.customerSellability,
      })
      continue
    }
    if (modes.get(productId)) {
      await releaseMutableForProduct(tx, input.orderId, productId, -delta, 'edited')
      await recomputeManagedAvailability(tx, [productId])
    } else {
      await tx.product.updateMany({
        where: { id: productId, isDeleted: false },
        data: { stock: { increment: -delta } },
      })
    }
  }
}

export async function acknowledgeCommittedAllocations(
  tx: Tx,
  orderId: string,
  actorId: string,
): Promise<{ acknowledgmentGroupId: string; allocations: number; quantity: number; idempotent: boolean }> {
  const rows = await tx.stockAllocation.findMany({
    where: { orderId, status: 'committed' },
    select: { id: true, quantity: true },
    orderBy: { id: 'asc' },
  })
  if (rows.length === 0) {
    const existing = await tx.stockAllocation.findMany({
      where: { orderId, status: 'awaiting_grins_sync' },
      select: { acknowledgmentId: true, quantity: true },
    })
    const group = existing[0]?.acknowledgmentId?.split(':')[0] ?? ''
    return { acknowledgmentGroupId: group, allocations: existing.length, quantity: existing.reduce((sum, row) => sum + row.quantity, 0), idempotent: true }
  }
  const group = randomUUID()
  for (const row of rows) {
    await tx.$executeRaw`
      UPDATE "StockAllocation"
      SET status = 'awaiting_grins_sync',
          "acknowledgmentId" = ${`${group}:${row.id}`},
          "acknowledgedAt" = clock_timestamp(),
          "acknowledgedBy" = ${actorId},
          "updatedAt" = clock_timestamp()
      WHERE id = ${row.id} AND status = 'committed'
    `
  }
  return { acknowledgmentGroupId: group, allocations: rows.length, quantity: rows.reduce((sum, row) => sum + row.quantity, 0), idempotent: false }
}

export async function stockLedgerInvariantViolations(tx: Tx, productIds?: readonly string[]): Promise<Array<{
  id: string
  stock: number
  grinsStock: number
  held: number
  expected: number
}>> {
  const filter = productIds?.length ? Prisma.sql`AND p.id IN (${Prisma.join([...new Set(productIds)])})` : Prisma.empty
  return tx.$queryRaw`
    SELECT p.id,
           p.stock,
           p."grinsStock" AS "grinsStock",
           COALESCE(SUM(a.quantity) FILTER (WHERE a.status IN ('reserved', 'committed', 'awaiting_grins_sync')), 0)::int AS held,
           GREATEST(p."grinsStock" - COALESCE(SUM(a.quantity) FILTER (WHERE a.status IN ('reserved', 'committed', 'awaiting_grins_sync')), 0)::int, 0)::int AS expected
    FROM "Product" p
    LEFT JOIN "StockAllocation" a ON a."productId" = p.id
    WHERE p."grinsStock" IS NOT NULL ${filter}
    GROUP BY p.id, p.stock, p."grinsStock"
    HAVING p.stock <> GREATEST(p."grinsStock" - COALESCE(SUM(a.quantity) FILTER (WHERE a.status IN ('reserved', 'committed', 'awaiting_grins_sync')), 0)::int, 0)
    ORDER BY p.id
  `
}
