import 'server-only'
import { prisma } from '@/lib/prisma'
import { calculatePrice } from '@/lib/customer-segmentation'
import { calculateDiscount } from '@/lib/promo-codes'

// Authoritative server-side pricing. Never trust client-supplied prices/totals:
// recompute everything from the DB catalog so a tampered request cannot lower the charge.

export const TAX_RATE = 0.18
export const DEFAULT_DELIVERY_FEE = 500
export const DELIVERY_FEES: Record<string, number> = {
  courier: 500,
  pickup: 0,
  post: 300,
}

type BulkTier = { quantity: number; pricePerUnit: number }

type CatalogPrice = { price: number; bulkPricingTiers?: BulkTier[] }

export type LineItemInput = { id: string; quantity: number; price?: number }
export type ResolvedLineItem = { id: string; quantity: number; price: number; fromCatalog: boolean }

function sanitizeBulkTiers(value: unknown): BulkTier[] | undefined {
  if (!Array.isArray(value)) return undefined
  const tiers = value
    .filter(
      (t): t is BulkTier =>
        !!t &&
        typeof (t as BulkTier).quantity === 'number' &&
        typeof (t as BulkTier).pricePerUnit === 'number'
    )
    .map((t) => ({ quantity: t.quantity, pricePerUnit: t.pricePerUnit }))
  return tiers.length > 0 ? tiers : undefined
}

/** Fetch authoritative catalog prices for a set of product ids. */
export async function getCatalogPrices(ids: string[]): Promise<Map<string, CatalogPrice>> {
  const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
  if (uniqueIds.length === 0) return new Map()

  const rows = await prisma.product.findMany({
    where: { id: { in: uniqueIds }, isDeleted: false },
    select: { id: true, price: true, bulkPricingTiers: true },
  })

  const map = new Map<string, CatalogPrice>()
  for (const row of rows) {
    map.set(row.id, {
      price: row.price,
      bulkPricingTiers: sanitizeBulkTiers(row.bulkPricingTiers),
    })
  }
  return map
}

/**
 * Resolve each line item's unit price from the catalog (bulk-tier aware).
 * Falls back to the sanitized client price only when the product is missing from the catalog.
 */
export async function resolveLineItems(items: LineItemInput[]): Promise<ResolvedLineItem[]> {
  const prices = await getCatalogPrices(items.map((i) => i.id))

  return items.map((item) => {
    const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0))
    const catalog = prices.get(item.id)

    if (catalog) {
      return { id: item.id, quantity, price: calculatePrice(catalog, quantity), fromCatalog: true }
    }

    const fallback = Number(item.price)
    const safePrice = Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 0
    return { id: item.id, quantity, price: safePrice, fromCatalog: false }
  })
}

/** Validate a promo code against the DB and return its discount percentage (0 if invalid). */
export async function getServerPromoDiscountPct(
  code: string | undefined | null,
  subtotal: number
): Promise<number> {
  const trimmed = code?.toString().trim()
  if (!trimmed) return 0

  const promo = await prisma.promoCode.findFirst({
    where: { code: trimmed.toUpperCase(), active: true },
  })
  if (!promo) return 0
  if (promo.minOrder && subtotal < promo.minOrder) return 0
  if (promo.expiresAt && new Date() > promo.expiresAt) return 0
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return 0

  return promo.discount
}

export type RecomputeInput = {
  items: LineItemInput[]
  promoCode?: string | null
  deliveryMethod?: string | null
  bonusSpent?: number | null
  /** Authenticated user's real bonus balance; null/undefined for guests (no bonus allowed). */
  userBonusBalance?: number | null
}

export type RecomputedPricing = {
  items: ResolvedLineItem[]
  subtotal: number
  discount: number
  tax: number
  delivery: number
  bonusSpent: number
  total: number
  promoApplied: boolean
}

/** Recompute an order's money fields authoritatively from the catalog. */
export async function recomputeOrderPricing(input: RecomputeInput): Promise<RecomputedPricing> {
  const items = await resolveLineItems(input.items)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const discountPct = await getServerPromoDiscountPct(input.promoCode, subtotal)
  const discount = discountPct > 0 ? calculateDiscount(subtotal, discountPct) : 0

  const delivery = DELIVERY_FEES[input.deliveryMethod ?? ''] ?? DEFAULT_DELIVERY_FEE
  const tax = Math.round((subtotal - discount) * TAX_RATE)
  const grandTotal = subtotal - discount + tax + delivery

  // Bonus can only be spent by an authenticated user, capped by real balance and the order total.
  const balance = typeof input.userBonusBalance === 'number' ? Math.max(0, input.userBonusBalance) : 0
  const requested = Math.max(0, Math.round(Number(input.bonusSpent) || 0))
  const bonusSpent = Math.min(requested, balance, Math.max(0, grandTotal))

  const total = Math.max(0, grandTotal - bonusSpent)

  return {
    items,
    subtotal,
    discount,
    tax,
    delivery,
    bonusSpent,
    total,
    promoApplied: discountPct > 0,
  }
}
