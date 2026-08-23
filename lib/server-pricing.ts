import 'server-only'
import { prisma } from '@/lib/prisma'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import { calculatePrice } from '@/lib/customer-segmentation'
import { calculateDiscount } from '@/lib/promo-codes'
import { extractVat } from '@/lib/tax'
import { calcOrderBonus, pointsToEuros, eurosToPoints } from '@/lib/bonus-program'
import { calcDeliveryFee } from '@/lib/delivery'
import { getBonusProgramConfig } from '@/lib/bonus-config-server-store'
import { toNum } from '@/lib/decimal'

// Authoritative server-side pricing. Never trust client-supplied prices/totals:
// recompute everything from the DB catalog so a tampered request cannot lower the charge.
//
// Note: money storage is Decimal/exact now, but the arithmetic in this file (and in
// lib/tax.ts, lib/delivery.ts, lib/bonus-program.ts, lib/promo-codes.ts) is still plain
// float math with cent-rounding applied at each step. The Decimal migration fixed
// storage-level drift only, not calculation-level drift — see
// docs/superpowers/specs/2026-07-20-money-decimal-storage-design.md for the full
// reasoning. Don't assume "money is Decimal now" means all float-related money bugs
// are gone.

type BulkTier = { quantity: number; pricePerUnit: number }

type CatalogPrice = { price: number; oldPrice: number | null; brand: string; category: string; bulkPricingTiers?: BulkTier[]; bonusRate: number }

export type LineItemInput = { id: string; quantity: number; price?: number }
export type ResolvedLineItem = {
  id: string
  quantity: number
  price: number
  bonusRate: number
  oldPrice?: number | null
  brand?: string
  category?: string
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
type PricingDb = Pick<ExtendedTransactionClient, 'product' | 'promoCode' | 'keyValueSetting' | 'order' | 'promoCodeRedemption'>

export async function getCatalogPrices(ids: string[], db: PricingDb = prisma): Promise<Map<string, CatalogPrice>> {
  const uniqueIds = [...new Set(ids.filter((id) => typeof id === 'string' && id.length > 0))]
  if (uniqueIds.length === 0) return new Map()

  const rows = await db.product.findMany({
    where: { id: { in: uniqueIds }, isDeleted: false },
    select: { id: true, price: true, oldPrice: true, brand: true, category: true, bulkPricingTiers: true, bonusRate: true },
  })

  const map = new Map<string, CatalogPrice>()
  for (const row of rows) {
    map.set(row.id, {
      price: toNum(row.price),
      oldPrice: row.oldPrice == null ? null : toNum(row.oldPrice),
      brand: row.brand,
      category: row.category,
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
export async function resolveLineItems(items: LineItemInput[], db: PricingDb = prisma): Promise<ResolvedLineItem[]> {
  const prices = await getCatalogPrices(items.map((i) => i.id), db)

  return items.map((item) => {
    const quantity = Math.max(0, Math.floor(Number(item.quantity) || 0))
    const catalog = prices.get(item.id)

    if (catalog) {
      return {
        id: item.id,
        quantity,
        price: calculatePrice(catalog, quantity),
        bonusRate: catalog.bonusRate,
        oldPrice: catalog.oldPrice,
        brand: catalog.brand,
        category: catalog.category,
        fromCatalog: true,
      }
    }

    const fallback = Number(item.price)
    const safePrice = Number.isFinite(fallback) && fallback > 0 ? Math.round(fallback) : 0
    return { id: item.id, quantity, price: safePrice, bonusRate: 0, oldPrice: null, brand: '', category: '', fromCatalog: false }
  })
}

/** Validate a promo code against the DB and return its discount percentage (0 if invalid). */
export async function getServerPromoDiscountPct(
  code: string | undefined | null,
  subtotal: number,
  db: PricingDb = prisma
): Promise<number> {
  const trimmed = code?.toString().trim()
  if (!trimmed) return 0

  const promo = await db.promoCode.findFirst({
    where: { code: trimmed.toUpperCase(), active: true },
  })
  if (!promo) return 0
  if (promo.minOrder && subtotal < promo.minOrder) return 0
  if (promo.expiresAt && new Date() > promo.expiresAt) return 0
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return 0

  return promo.discount
}

export type PromoResult = { valid: boolean; discount: number; code?: string; eligibleAmount: number; reason?: string; promoId?: string }

export async function evaluatePromoCode(
  code: string | undefined | null,
  items: ResolvedLineItem[],
  customer: { userId?: string | null; email?: string | null } = {},
  db: PricingDb = prisma
): Promise<PromoResult> {
  const trimmed = code?.trim().toUpperCase()
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  if (!trimmed) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'code_required' }
  const promo = await db.promoCode.findFirst({ where: { code: trimmed, active: true } })
  if (!promo) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'invalid' }
  const now = new Date()
  if (promo.startsAt && now < promo.startsAt) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'not_started' }
  if (promo.expiresAt && now > promo.expiresAt) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'expired' }
  if (promo.maxUses !== null && promo.usedCount >= promo.maxUses) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'max_uses' }
  if (subtotal < promo.minOrder) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'min_order' }

  const identity = customer.userId ? { userId: customer.userId } : customer.email ? { email: customer.email.toLowerCase() } : null
  if ((promo.perUserLimit || promo.firstOrderOnly) && !identity) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'login_required' }
  if (promo.perUserLimit && identity) {
    const count = await db.promoCodeRedemption.count({ where: { promoCodeId: promo.id, ...identity } })
    if (count >= promo.perUserLimit) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'user_limit' }
  }
  if (promo.firstOrderOnly && identity) {
    const count = await db.order.count({ where: customer.userId ? { userId: customer.userId } : { email: customer.email!.toLowerCase() } })
    if (count > 0) return { valid: false, discount: 0, eligibleAmount: 0, reason: 'first_order_only' }
  }

  const excludedProductIds = promo.excludedProductIds ?? []
  const productIds = promo.productIds ?? []
  const brands = promo.brands ?? []
  const categories = promo.categories ?? []
  const selected = items.filter((item) => {
    if (!item.fromCatalog || excludedProductIds.includes(item.id)) return false
    if (promo.excludeSaleItems && item.oldPrice != null && item.oldPrice > item.price) return false
    if (promo.appliesTo === 'products') return productIds.includes(item.id)
    if (promo.appliesTo === 'brands') return brands.some((b) => b.toLowerCase() === (item.brand ?? '').toLowerCase())
    if (promo.appliesTo === 'categories') return categories.includes(item.category ?? '')
    return true
  })
  const eligibleAmount = Math.round(selected.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
  if (eligibleAmount <= 0) return { valid: false, discount: 0, eligibleAmount, reason: 'no_eligible_items' }
  if (eligibleAmount < promo.minEligibleAmount) return { valid: false, discount: 0, eligibleAmount, reason: 'min_eligible_amount' }
  const value = promo.discountValue ?? promo.discount
  let discount = promo.discountType === 'fixed' ? Math.min(value, eligibleAmount) : calculateDiscount(eligibleAmount, value)
  if (promo.maxDiscount != null) discount = Math.min(discount, promo.maxDiscount)
  discount = Math.round(Math.max(0, discount) * 100) / 100
  return { valid: discount > 0, discount, eligibleAmount, code: promo.code, promoId: promo.id }
}

export type RecomputeInput = {
  items: LineItemInput[]
  promoCode?: string | null
  deliveryMethod?: string | null
  bonusSpent?: number | null
  /** Authenticated user's real bonus balance; null/undefined for guests (no bonus allowed). */
  userBonusBalance?: number | null
  userId?: string | null
  email?: string | null
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
export async function recomputeOrderPricing(input: RecomputeInput, db: PricingDb = prisma): Promise<RecomputedPricing> {
  const items = await resolveLineItems(input.items, db)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)

  const promo = await evaluatePromoCode(input.promoCode, items, { userId: input.userId, email: input.email }, db)
  const discount = promo.valid ? promo.discount : 0

  const delivery = calcDeliveryFee(input.deliveryMethod, subtotal - discount)
  // Catalog prices already include VAT — tax here is informational only, not added to the total.
  const tax = extractVat(subtotal - discount)
  const grandTotal = subtotal - discount + delivery

  // Admin-configured bonus program (rate/caps) — the only authoritative source;
  // never trust a client-supplied config.
  const bonusConfig = await getBonusProgramConfig(db)

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
    promoApplied: promo.valid,
  }
}
