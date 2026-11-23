import type { Prisma } from '@/generated/prisma/client'

/**
 * Orders imported from the old nopCommerce shop (scripts/migrate-from-mssql.ts) stay in "Order"
 * as the customers' purchase history ("My orders", the admin customer profile), but they are not
 * orders of the new shop and must not appear in the admin order list or in its sales figures.
 *
 * An imported order is recognised by two facts that must BOTH hold:
 * - no payment provider: the import never set one, while every order created by this application
 *   (checkout and admin) records 'manual' or 'paysera';
 * - a nopCommerce payment method: the import kept the old shop's system name ("Payments.*",
 *   "DevPartner.Payments.*") or 'unknown' when it was missing; this application only writes its
 *   own short codes (bank, cash, card, paysera).
 * Requiring both keeps the filter fail-open: an order of the new shop missing one of the facts
 * is still shown rather than silently hidden. Client-safe (no runtime Prisma import);
 * the SQL form for raw aggregates is in lib/order-origin-sql.ts.
 */
export const LEGACY_PAYMENT_METHOD_PREFIXES = ['Payments.', 'DevPartner.'] as const
export const LEGACY_UNKNOWN_PAYMENT_METHOD = 'unknown'

export function isLegacyImportedOrder(order: { paymentProvider?: string | null; paymentMethod: string }): boolean {
  if (order.paymentProvider != null) return false
  return order.paymentMethod === LEGACY_UNKNOWN_PAYMENT_METHOD
    || LEGACY_PAYMENT_METHOD_PREFIXES.some((prefix) => order.paymentMethod.startsWith(prefix))
}

/** Prisma filter: orders of the new shop (everything except imported nopCommerce history). */
export const NEW_SHOP_ORDER_WHERE = {
  NOT: {
    paymentProvider: null,
    OR: [
      ...LEGACY_PAYMENT_METHOD_PREFIXES.map((prefix) => ({ paymentMethod: { startsWith: prefix } })),
      { paymentMethod: LEGACY_UNKNOWN_PAYMENT_METHOD },
    ],
  },
} satisfies Prisma.OrderWhereInput
