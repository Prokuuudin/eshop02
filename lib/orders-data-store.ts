import { prisma } from '@/lib/prisma'
import type { Order as PrismaOrder } from '@/generated/prisma/client'
import type { ServerUser } from '@/lib/server-auth'

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

export type ServerOrder = {
  id: string
  createdAt: string
  items: ServerOrderItem[]
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
  paymentProvider?: 'stripe' | 'manual'
  paymentSessionId?: string
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
    subtotal: row.subtotal,
    tax: row.tax,
    delivery: row.delivery,
    deliveryMethod: row.deliveryMethod,
    paymentMethod: row.paymentMethod,
    promoCode: row.promoCode ?? undefined,
    discount: row.discount,
    total: row.total,
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
    paymentProvider: (row.paymentProvider as 'stripe' | 'manual') ?? undefined,
    paymentSessionId: row.paymentSessionId ?? undefined,
    language: (row as Record<string, unknown>).language as string ?? 'ru',
    userId: row.userId ?? undefined,
    companyId: row.companyId ?? undefined,
  }
}

function buildOrderData(order: Omit<ServerOrder, 'id'>) {
  return {
    createdAt: new Date(order.createdAt),
    items: order.items,
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
    language: order.language ?? 'ru',
    userId: order.userId ?? null,
    companyId: order.companyId ?? null,
  }
}

/** Create the order row plus its side effects (stock, promo usage, bonus balance) atomically. */
const createOrderWithSideEffects = async (id: string, order: Omit<ServerOrder, 'id'>): Promise<PrismaOrder> => {
  const data = buildOrderData(order)

  return prisma.$transaction(async (tx) => {
    const created = await tx.order.create({ data: { id, ...data } })

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

    // Increment promo usedCount so maxUses limit is enforced
    if (order.promoCode) {
      await tx.promoCode.updateMany({
        where: { code: order.promoCode.toUpperCase(), active: true },
        data: { usedCount: { increment: 1 } },
      })
    }

    // Apply bonus balance changes once, at creation: spent points debit, earned points credit.
    // Values are already recomputed and capped server-side (recomputeOrderPricing).
    const bonusDelta = (order.bonusEarned ?? 0) - (order.bonusSpent ?? 0)
    if (order.userId && bonusDelta !== 0) {
      const user = await tx.user.findUnique({
        where: { id: order.userId },
        select: { bonusPoints: true },
      })
      if (user) {
        await tx.user.update({
          where: { id: order.userId },
          data: { bonusPoints: Math.max(0, user.bonusPoints + bonusDelta) },
        })
      }
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
export const createServerOrder = async (order: Omit<ServerOrder, 'id'>): Promise<ServerOrder> => {
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt++) {
    const id = await generateNextOrderId()
    try {
      const row = await createOrderWithSideEffects(id, order)
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

export const updateServerOrderPayment = async (
  orderId: string,
  updates: Partial<Pick<ServerOrder, 'paymentStatus' | 'paymentProvider' | 'paymentSessionId'>>
): Promise<ServerOrder | null> => {
  const existing = await prisma.order.findUnique({ where: { id: orderId } })
  if (!existing) return null

  const row = await prisma.order.update({
    where: { id: orderId },
    data: {
      paymentStatus: updates.paymentStatus ?? undefined,
      paymentProvider: updates.paymentProvider ?? undefined,
      paymentSessionId: updates.paymentSessionId ?? undefined,
    },
  })

  return mapDbToServerOrder(row)
}
