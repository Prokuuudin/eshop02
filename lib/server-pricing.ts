import 'server-only'
import { prisma } from '@/lib/prisma'
import { calculatePrice } from '@/lib/customer-segmentation'
import { calculateDiscount } from '@/lib/promo-codes'
import { extractVat } from '@/lib/tax'
import { calcOrderBonus, pointsToEuros, eurosToPoints } from '@/lib/bonus-program'
import { calcDeliveryFee } from '@/lib/delivery'
import { getBonusProgramConfig } from '@/lib/bonus-config-server-store'
import { toNum } from '@/lib/decimal'

// Authoritative server-side pricing. Never trust client-supplied prices/totals:
// recompute everything from the DB catalog so a tampered request cannot lower the charge.

type BulkTier = { quantity: number; pricePerUnit: number }

type CatalogPrice = { price: number; bulkPricingTiers?: BulkTier[]; bonusRate: number }

export type LineItemInput = { id: string; quantity: number; price?: number }
export type ResolvedLineItem = {
  id: string
  quantity: number
  price: number
  bonusRate: number
  fromCatalog: boolean
}

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
    select: { id: true, price: true, bulkPricingTiers: true, bonusRate: true },
  })

  const map = new Map<string, CatalogPrice>()
  for (const row of rows) {
    map.set(row.id, {
      price: toNum(row.price),
      bulkPricingTiers: sanitizeBulkTiers(row.bulkPricingTiers),
      bonusRate: typeof row.bonusRate === 'number' ? row.bonusRate : 0,
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
      return {
        id: item.id,
        quantity,
        price: calculatePrice(catalog, quantity),
        bonusRate: catalog.bonusRate,
        fromCatalog: true,
      }
    }

    const fallback = Number(item.price)
    const safePrice = Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 0
    return { id: item.id, quantity, price: safePrice, bonusRate: 0, fromCatalog: false }
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
  bonusEarned: number
  total: number
  promoApplied: boolean
}

/** Recompute an order's money fields authoritatively from the catalog. */
export async function recomputeOrderPricing(input: RecomputeInput): Promise<RecomputedPricing> {
  const items = await resolveLineItems(input.items)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const discountPct = await getServerPromoDiscountPct(input.promoCode, subtotal)
  const discount = discountPct > 0 ? calculateDiscount(subtotal, discountPct) : 0

  const delivery = calcDeliveryFee(input.deliveryMethod, subtotal - discount)
  // Catalog prices already include VAT — tax here is informational only, not added to the total.
  const tax = extractVat(subtotal - discount)
  const grandTotal = subtotal - discount + delivery

  // Admin-configured bonus program (rate/caps) — the only authoritative source;
  // never trust a client-supplied config.
  const bonusConfig = await getBonusProgramConfig()

  let bonusSpent = 0

  if (bonusConfig.enabled) {
    // Bonus can only be spent by an authenticated user, capped by: real balance,
    // the admin's max-spend-percent of the order, the minimum redemption threshold,
    // and the order total itself.
    const balance = typeof input.userBonusBalance === 'number' ? Math.max(0, input.userBonusBalance) : 0
    const requested = Math.max(0, Math.round(Number(input.bonusSpent) || 0))
    const maxSpendByPercent = eurosToPoints((grandTotal * bonusConfig.maxSpendPercent) / 100)
    bonusSpent =
      balance >= bonusConfig.minPointsToSpend
        ? Math.min(requested, balance, maxSpendByPercent, eurosToPoints(Math.max(0, grandTotal)))
        : 0
  }

  const total = Math.max(0, Math.round((grandTotal - pointsToEuros(bonusSpent)) * 100) / 100)

  // Points earned: catalog bonusRate per unit when set, otherwise the admin-configured rate
  // percent of the item subtotal, capped per order, gated by the minimum order amount. Scaled
  // down proportionally when the customer pays part of the order with points.
  let bonusEarned = 0
  if (bonusConfig.enabled && grandTotal >= bonusConfig.minOrderForEarn) {
    const bonusEarnedBase = calcOrderBonus(items, bonusConfig.earnRatePercent)
    const scaledEarned =
      bonusSpent > 0 && grandTotal > 0
        ? Math.max(0, Math.round((bonusEarnedBase * total) / grandTotal))
        : bonusEarnedBase
    bonusEarned =
      bonusConfig.maxEarnPerOrder > 0 ? Math.min(scaledEarned, bonusConfig.maxEarnPerOrder) : scaledEarned
  }

  return {
    items,
    subtotal,
    discount,
    tax,
    delivery,
    bonusSpent,
    bonusEarned,
    total,
    promoApplied: discountPct > 0,
  }
}
