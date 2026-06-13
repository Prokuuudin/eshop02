import { prisma } from '@/lib/prisma'
import type { Order as PrismaOrder } from '@/generated/prisma/client'

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

export const createOrUpdateServerOrder = async (order: ServerOrder): Promise<ServerOrder> => {
  const data = {
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

  const existing = await prisma.order.findUnique({ where: { id: order.id } })

  let row
  if (existing) {
    row = await prisma.order.update({ where: { id: order.id }, data })
  } else {
    row = await prisma.$transaction(async (tx) => {
      const created = await tx.order.create({ data: { id: order.id, ...data } })

      // Decrement stock for each item — best effort, ignore missing products
      for (const item of order.items) {
        if (item.id && typeof item.quantity === 'number' && item.quantity > 0) {
          await tx.product.updateMany({
            where: { id: item.id, isDeleted: false, stock: { gte: item.quantity } },
            data: { stock: { decrement: item.quantity } },
          })
        }
      }

      // Increment promo usedCount so maxUses limit is enforced
      if (order.promoCode) {
        await tx.promoCode.updateMany({
          where: { code: order.promoCode.toUpperCase(), active: true },
          data: { usedCount: { increment: 1 } },
        })
      }

      return created
    })
  }

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
