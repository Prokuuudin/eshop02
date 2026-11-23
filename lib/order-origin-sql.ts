import { Prisma } from '@/generated/prisma/client'
import { LEGACY_PAYMENT_METHOD_PREFIXES, LEGACY_UNKNOWN_PAYMENT_METHOD } from '@/lib/order-origin'

/**
 * NEW_SHOP_ORDER_WHERE (lib/order-origin.ts) as an SQL condition on the "Order" row aliased `o`,
 * for the raw admin aggregates. "paymentMethod" is NOT NULL, so it never evaluates to NULL.
 */
export const newShopOrderSql = Prisma.sql`NOT (o."paymentProvider" IS NULL AND (${Prisma.join(
  [
    ...LEGACY_PAYMENT_METHOD_PREFIXES.map((prefix) => Prisma.sql`o."paymentMethod" LIKE ${`${prefix}%`}`),
    Prisma.sql`o."paymentMethod" = ${LEGACY_UNKNOWN_PAYMENT_METHOD}`,
  ],
  ' OR ',
)}))`
