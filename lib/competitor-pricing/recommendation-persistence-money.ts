import type { Prisma } from '@/generated/prisma/client'
import { centsToMoneyString, moneyToCents } from './money'

// Decimal-boundary helpers live outside recommendation-snapshot.ts so the pure
// analysis/hash dependency graph never loads generated Prisma runtime.

export function snapshotMoney(value: Prisma.Decimal | string): string {
  return centsToMoneyString(moneyToCents(value))
}

/**
 * erp_pending → erp_applied: the ERP-owned Product.price (after sync) equals the
 * recommended price exactly at cent precision, and the product is still ERP-linked.
 */
export function isRecommendationFulfilledByErp(
  product: { externalId: string | null; price: Prisma.Decimal | string },
  recommendedPrice: Prisma.Decimal | string,
): boolean {
  return product.externalId !== null && moneyToCents(product.price) === moneyToCents(recommendedPrice)
}
