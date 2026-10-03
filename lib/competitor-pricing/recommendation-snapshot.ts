import { createHash } from 'node:crypto'
import type { Prisma } from '@/generated/prisma/client'
import { centsToMoneyString, moneyToCents } from './money'
import type { PricingRules } from './settings'
import type { MatchStatus, PriceAuthority } from './constants'

// Immutable input snapshot stored with every PricingRecommendation. It is enough to
// explain the decision, audit it, reproduce it (same algorithm version + snapshot ⇒ same
// result) and detect staleness (recompute snapshot now → different inputHash ⇒ stale).
// Money is stored as canonical "12.34" strings, never floats.

export type SnapshotObservation = {
  observationId: string
  competitorId: string
  competitorProductId: string
  matchStatus: MatchStatus
  regularPrice: string | null
  salePrice: string | null
  currency: string
  availability: string
  lastSeenAt: string
}

export type RecommendationInputSnapshot = {
  algorithmVersion: string
  product: {
    id: string
    price: string
    revision: number
    priceAuthority: PriceAuthority
    erpPriceMissing: boolean
  }
  observations: SnapshotObservation[]
  rules: PricingRules
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
    .join(',')}}`
}

/** Order-independent for observations (sorted by id) and key-order independent. */
export function recommendationInputHash(snapshot: RecommendationInputSnapshot): string {
  const normalized = { ...snapshot, observations: [...snapshot.observations].sort((a, b) => (a.observationId < b.observationId ? -1 : a.observationId > b.observationId ? 1 : 0)) }
  return createHash('sha256').update(canonicalJson(normalized)).digest('hex')
}

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
