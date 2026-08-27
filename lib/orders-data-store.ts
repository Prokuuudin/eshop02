import { prisma } from '@/lib/prisma'
import type { NextRequest } from 'next/server'
import { Prisma } from '@/generated/prisma/client'
import type { Order as PrismaOrder } from '@/generated/prisma/client'
import type { ServerUser } from '@/lib/server-auth'
import { toNum } from '@/lib/decimal'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { extractVat, isOrderTaxIncluded } from '@/lib/tax'
import { appendServerAudit } from '@/lib/server-audit'

export type ServerPaymentStatus = 'unpaid' | 'pending' | 'paid' | 'failed'

type ServerOrderItem = {
  id: string
  title: string
  brand: string
  image: string
  category: string
  price: number
  rating: number
  stock: number
  quantity: number
}

export type ServerOrderLegalDetails =
  | { customerType: 'individual'; personalCode: string }
  | {
      customerType: 'company'
      companyName: string
      regNumber: string
      vatNumber?: string
      legalAddress: string
      bankName: string
      iban: string
    }

export type ServerOrder = {
  id: string
  createdAt: string
  items: ServerOrderItem[]
  legalDetails?: ServerOrderLegalDetails
  subtotal: number
  tax: number
  delivery: number
  deliveryMethod: string
  /** Магазин самовывоза (id из data/stores.ts). В БД отдельной колонки нет:
   *  при pickup адрес магазина записывается в address/city (см. /api/orders POST). */
  pickupStoreId?: string
  paymentMethod: string
  promoCode?: string
  discount: number
  total: number
  firstName: string
  lastName: string
  email: string
  phone: string
  address: string
  city: string
  postalCode?: string
  bonusSpent?: number
  bonusEarned?: number
  paymentStatus?: ServerPaymentStatus
  paymentProvider?: 'manual'
  paymentSessionId?: string
  stockReservationStatus?: 'reserved' | 'committed' | 'released'
  stockReservedUntil?: string
  stockReleasedAt?: string
  language?: string
  userId?: string
  companyId?: string
}

/** Thrown when one or more order items exceed the product's current stock. */
export class InsufficientStockError extends Error {
  readonly items: string[]

  constructor(items: string[]) {
    super(`Insufficient stock for: ${items.join(', ')}`)
    this.name = 'InsufficientStockError'
    this.items = items
  }
}

export class InsufficientBonusPointsError extends Error {
  constructor() {
    super('Insufficient bonus points')
    this.name = 'InsufficientBonusPointsError'
  }
}

export class PromoCodeUsageLimitError extends Error {
  constructor() {
    super('Promo code usage limit reached')
    this.name = 'PromoCodeUsageLimitError'
  }
}

export class AdminOrderUpdateError extends Error {
  constructor(
    message: string,
    readonly code: 'not_found' | 'paid_order' | 'released_stock' | 'invalid_item' | 'insufficient_stock'
  ) {
    super(message)
    this.name = 'AdminOrderUpdateError'
  }
}

export type AdminOrderUpdateInput = {
  items: Array<{ id: string; quantity: number; lineKey?: string; variantLabel?: string }>
  address: string
  city: string
  postalCode?: string
  deliveryMethod: 'courier' | 'pickup' | 'post' | 'venipak'
}

export type PrepareOrder = (
  tx: ExtendedTransactionClient,
  currentBonusBalance: number | null
) => Promise<Omit<ServerOrder, 'id'>>

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

function mapDbToServerOrder(row: PrismaOrder): ServerOrder {
  return {
    id: row.id,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    items: row.items as ServerOrderItem[],
    legalDetails: (row as Record<string, unknown>).legalDetails as ServerOrderLegalDetails ?? undefined,
    subtotal: toNum(row.subtotal),
    tax: toNum(row.tax),
    delivery: toNum(row.delivery),
    deliveryMethod: row.deliveryMethod,
    paymentMethod: row.paymentMethod,
    promoCode: row.promoCode ?? undefined,
    discount: toNum(row.discount),
    total: toNum(row.total),
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    address: row.address,
    city: row.city,
    postalCode: row.postalCode ?? undefined,
    bonusSpent: row.bonusSpent ?? undefined,
    bonusEarned: row.bonusEarned ?? undefined,
    paymentStatus: (row.paymentStatus as ServerPaymentStatus) ?? 'unpaid',
    paymentProvider: row.paymentProvider === 'manual' ? 'manual' : undefined,
    paymentSessionId: row.paymentSessionId ?? undefined,
    stockReservationStatus: row.stockReservationStatus as ServerOrder['stockReservationStatus'],
    stockReservedUntil: row.stockReservedUntil?.toISOString(),
    stockReleasedAt: row.stockReleasedAt?.toISOString(),
    language: (row as Record<string, unknown>).language as string ?? 'ru',
    userId: row.userId ?? undefined,
    companyId: row.companyId ?? undefined,
  }
}

function buildOrderData(order: Omit<ServerOrder, 'id'>) {
  return {
    createdAt: new Date(order.createdAt),
    items: order.items,
    legalDetails: order.legalDetails ?? Prisma.DbNull,
    subtotal: order.subtotal,
    tax: order.tax,
    delivery: order.delivery,
    deliveryMethod: order.deliveryMethod,
    paymentMethod: order.paymentMethod,
    promoCode: order.promoCode ?? null,
    discount: order.discount,
    total: order.total,
    firstName: order.firstName,
    lastName: order.lastName,
    email: order.email,
    phone: order.phone,
    address: order.address,
    city: order.city,
    postalCode: order.postalCode ?? null,
    bonusSpent: order.bonusSpent ?? null,
    bonusEarned: order.bonusEarned ?? null,
    paymentStatus: order.paymentStatus ?? 'unpaid',
    paymentProvider: order.paymentProvider ?? null,
    paymentSessionId: order.paymentSessionId ?? null,
    stockReservationStatus: order.stockReservationStatus ?? 'committed',
    stockReservedUntil: order.stockReservedUntil ? new Date(order.stockReservedUntil) : null,
    stockReleasedAt: order.stockReleasedAt ? new Date(order.stockReleasedAt) : null,
    language: order.language ?? 'ru',
    userId: order.userId ?? null,
    companyId: order.companyId ?? null,
  }
}

/** Create the order row plus its side effects (stock, promo usage, bonus balance) atomically. */
const createOrderWithSideEffects = async (id: string, initialOrder: Omit<ServerOrder, 'id'>, prepare?: PrepareOrder): Promise<PrismaOrder> => {
  return prisma.$transaction(async (tx) => {
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

    // Decrement stock for each item. updateMany's where clause (isDeleted: false,
    // stock >= quantity) is the actual guard — if it matches 0 rows the product is
    // missing, deleted, or doesn't have enough stock. That must fail the whole
    // order, not silently create it with unaccounted-for items.
    const outOfStockIds: string[] = []
    for (const item of order.items) {
      if (item.id && typeof item.quantity === 'number' && item.quantity > 0) {
        const result = await tx.product.updateMany({
          where: { id: item.id, isDeleted: false, stock: { gte: item.quantity } },
          data: { stock: { decrement: item.quantity } },
        })
        if (result.count === 0) outOfStockIds.push(item.id)
      }
    }
    if (outOfStockIds.length > 0) {
      throw new InsufficientStockError(outOfStockIds)
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
          reason: `Order ${created.id}`,
        },
      })
    }

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
export const createServerOrder = async (order: Omit<ServerOrder, 'id'>, prepare?: PrepareOrder): Promise<ServerOrder> => {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = await generateNextOrderId()
    try {
      const row = await createOrderWithSideEffects(id, order, prepare)
      return mapDbToServerOrder(row)
    } catch (e) {
      if (!isUniqueConflict(e)) throw e
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
  order: Pick<PrismaOrder, 'id' | 'items'>,
  extraWhere: { stockReservedUntil?: { lte: Date } } = {},
): Promise<boolean> {
  const released = await tx.order.updateMany({
    where: { id: order.id, stockReservationStatus: 'reserved', ...extraWhere },
    data: { stockReservationStatus: 'released', stockReleasedAt: new Date(), stockReservedUntil: null },
  })
  if (released.count !== 1) return false

  for (const item of order.items as ServerOrderItem[]) {
    if (item.id && Number.isInteger(item.quantity) && item.quantity > 0) {
      await tx.product.updateMany({
        where: { id: item.id, isDeleted: false },
        data: { stock: { increment: item.quantity } },
      })
    }
  }
  return true
}

export async function applyOrderReservationPaymentState(
  tx: ReservationTx,
  orderId: string,
  paymentStatus: ServerPaymentStatus,
): Promise<void> {
  if (paymentStatus === 'paid') {
    await tx.order.updateMany({
      where: { id: orderId, stockReservationStatus: 'reserved' },
      data: { stockReservationStatus: 'committed', stockReservedUntil: null },
    })
    return
  }
  if (paymentStatus === 'failed') {
    const order = await tx.order.findUnique({ where: { id: orderId }, select: { id: true, items: true } })
    if (order) await releaseReservation(tx, order)
  }
}

/** Opportunistic cleanup; the conditional transition makes concurrent cleaners idempotent. */
export async function releaseExpiredStockReservations(now = new Date()): Promise<number> {
  const expired = await prisma.order.findMany({
    where: { stockReservationStatus: 'reserved', stockReservedUntil: { lte: now } },
    select: { id: true, items: true },
    take: 50,
  })
  let count = 0
  for (const order of expired) {
    const released = await prisma.$transaction((tx) =>
      releaseReservation(tx, order, { stockReservedUntil: { lte: now } }))
    if (released) count += 1
  }
  return count
}

export const updateServerOrderPayment = async (
  orderId: string,
  updates: Partial<Pick<ServerOrder, 'paymentStatus' | 'paymentProvider' | 'paymentSessionId'>>
): Promise<ServerOrder | null> => {
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.order.findUnique({ where: { id: orderId } })
    if (!existing) return null
    if (updates.paymentStatus) {
      await applyOrderReservationPaymentState(tx, orderId, updates.paymentStatus)
    }
    // `paid` is terminal. A delayed verify/expiry request must never downgrade it.
    if (existing.paymentStatus === 'paid' && updates.paymentStatus && updates.paymentStatus !== 'paid') {
      return existing
    }
    return tx.order.update({
      where: { id: orderId },
      data: {
        paymentStatus: updates.paymentStatus ?? undefined,
        paymentProvider: updates.paymentProvider ?? undefined,
        paymentSessionId: updates.paymentSessionId ?? undefined,
      },
    })
  })

  return row ? mapDbToServerOrder(row) : null
}

const ADMIN_DELIVERY_COSTS: Record<AdminOrderUpdateInput['deliveryMethod'], number> = {
  courier: 5,
  pickup: 0,
  post: 4,
  venipak: 3,
}

function quantitiesByProduct(items: Array<{ id: string; quantity: number }>): Map<string, number> {
  const result = new Map<string, number>()
  for (const item of items) result.set(item.id, (result.get(item.id) ?? 0) + item.quantity)
  return result
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

    const requestedIds = [...new Set(input.items.map((item) => item.id))]
    const products = await tx.product.findMany({
      where: { id: { in: requestedIds }, isDeleted: false, isActive: true },
    })
    const byId = new Map(products.map((product) => [product.id, product]))
    if (products.length !== requestedIds.length) {
      throw new AdminOrderUpdateError('One or more products are unavailable', 'invalid_item')
    }

    const currentItems = current.items as ServerOrderItem[]
    const oldQty = quantitiesByProduct(currentItems)
    const newQty = quantitiesByProduct(input.items)

    for (const productId of new Set([...oldQty.keys(), ...newQty.keys()])) {
      const delta = (newQty.get(productId) ?? 0) - (oldQty.get(productId) ?? 0)
      if (delta > 0) {
        const changed = await tx.product.updateMany({
          where: { id: productId, isDeleted: false, isActive: true, stock: { gte: delta } },
          data: { stock: { decrement: delta } },
        })
        if (changed.count !== 1) {
          throw new AdminOrderUpdateError(`Insufficient stock for ${productId}`, 'insufficient_stock')
        }
      } else if (delta < 0) {
        await tx.product.updateMany({
          where: { id: productId, isDeleted: false },
          data: { stock: { increment: -delta } },
        })
      }
    }

    const items: ServerOrderItem[] = input.items.map((item) => {
      const product = byId.get(item.id)!
      return {
        id: product.id,
        title: product.title,
        brand: product.brand,
        image: product.image ?? '',
        category: product.category,
        price: toNum(product.price),
        rating: product.rating,
        stock: product.stock,
        quantity: item.quantity,
        ...(item.lineKey ? { lineKey: item.lineKey } : {}),
        ...(item.variantLabel ? { variantLabel: item.variantLabel } : {}),
      } as ServerOrderItem
    })

    const subtotal = Math.round(items.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
    const oldSubtotal = toNum(current.subtotal)
    const oldDiscount = toNum(current.discount)
    const discountRate = current.promoCode && oldSubtotal > 0 ? oldDiscount / oldSubtotal : 0
    const discount = Math.round(subtotal * discountRate * 100) / 100
    const delivery = ADMIN_DELIVERY_COSTS[input.deliveryMethod]
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
    const total = Math.max(0, Math.round((subtotal - discount + delivery - bonusSpent + (taxIncluded ? 0 : tax)) * 100) / 100)

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
        address: input.address,
        city: input.city,
        postalCode: input.postalCode ?? null,
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
