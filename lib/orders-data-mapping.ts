import { Prisma } from '@/generated/prisma/client'
import type { Order as PrismaOrder } from '@/generated/prisma/client'
import { toNum } from './decimal'
import type { ServerOrder, ServerOrderItem, ServerOrderLegalDetails, ServerPaymentStatus } from './orders-data-types'
import type { SelectedVariant } from '@/data/products'

/** Product columns an order line snapshot is built from (plus technicalSpecs for variant validation). */
export const ORDER_ITEM_SNAPSHOT_SELECT = {
  id: true, title: true, brand: true, image: true, category: true, rating: true, stock: true, sku: true, technicalSpecs: true,
} as const

export type OrderItemSnapshotProduct = {
  id: string
  title: string
  brand: string
  image: string | null
  category: string
  rating: number
  stock: number
  sku: string | null
}

/**
 * Order line snapshot taken from the DB product row. Price and quantity are decided by the
 * server (catalog pricing / staff edit); nothing descriptive is taken from the request body.
 */
export function buildOrderItemSnapshot(
  product: OrderItemSnapshotProduct,
  line: { quantity: number; price: number; lineKey?: string; variantLabel?: string; selectedVariants?: SelectedVariant[] },
): ServerOrderItem {
  return {
    id: product.id,
    title: product.title,
    brand: product.brand,
    image: product.image ?? '',
    category: product.category,
    price: line.price,
    rating: product.rating,
    stock: product.stock,
    quantity: line.quantity,
    ...(product.sku ? { sku: product.sku } : {}),
    ...(line.lineKey ? { lineKey: line.lineKey } : {}),
    ...(line.variantLabel ? { variantLabel: line.variantLabel } : {}),
    ...(line.selectedVariants?.length ? { selectedVariants: line.selectedVariants } : {}),
  }
}

export function mapDbToServerOrder(row: PrismaOrder): ServerOrder {
  return {
    id: row.id,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    items: row.items as ServerOrderItem[],
    legalDetails: (row as Record<string, unknown>).legalDetails as ServerOrderLegalDetails ?? undefined,
    subtotal: toNum(row.subtotal),
    tax: toNum(row.tax),
    delivery: toNum(row.delivery),
    deliveryLocation: (row.deliveryLocation as ServerOrder['deliveryLocation']) ?? undefined,
    deliveryLocationId: (row.deliveryLocation as ServerOrder['deliveryLocation'])?.id,
    deliveryMethod: row.deliveryMethod,
    pickupStoreId: row.pickupStoreId ?? undefined,
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
    trackingNumber: row.trackingNumber ?? undefined,
    trackingUrl: row.trackingUrl ?? undefined,
    labelUrl: row.labelUrl ?? undefined,
    shipmentCarrier: row.shipmentCarrier ?? undefined,
    country: row.country as ServerOrder['country'],
    postalCode: row.postalCode ?? undefined,
    bonusSpent: row.bonusSpent ?? undefined,
    bonusEarned: row.bonusEarned ?? undefined,
    paymentStatus: (row.paymentStatus as ServerPaymentStatus) ?? 'unpaid',
    paymentProvider: row.paymentProvider === 'manual' || row.paymentProvider === 'paysera' || row.paymentProvider === 'paypal' ? row.paymentProvider : undefined,
    paymentSessionId: row.paymentSessionId ?? undefined,
    stockReservationStatus: row.stockReservationStatus as ServerOrder['stockReservationStatus'],
    stockReservedUntil: row.stockReservedUntil?.toISOString(),
    stockReleasedAt: row.stockReleasedAt?.toISOString(),
    language: (row as Record<string, unknown>).language as string ?? 'ru',
    userId: row.userId ?? undefined,
    companyId: row.companyId ?? undefined,
    checkoutKey: row.checkoutKey ?? undefined,
  }
}

export function buildOrderData(order: Omit<ServerOrder, 'id'>): Omit<Prisma.OrderUncheckedCreateInput, 'id'> {
  return {
    createdAt: new Date(order.createdAt),
    items: order.items,
    legalDetails: order.legalDetails ?? Prisma.DbNull,
    subtotal: order.subtotal,
    tax: order.tax,
    delivery: order.delivery,
    deliveryLocation: order.deliveryLocation ?? Prisma.DbNull,
    deliveryMethod: order.deliveryMethod,
    pickupStoreId: order.pickupStoreId ?? null,
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
    country: order.country ?? 'LV',
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
    checkoutKey: order.checkoutKey ?? null,
  }
}
