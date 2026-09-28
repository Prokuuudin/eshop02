import type { Product } from '@/data/products'
import { redactProductPrices } from '@/lib/product-price-visibility'

/**
 * Single source of truth for "may this product be sold at its Product.price?".
 *
 * An ERP-linked product (externalId set) whose ERP record has no positive B2B price
 * (erpPriceMissing, maintained by FULL sync) keeps its old local Product.price only as
 * data — that value is not a valid B2B price unless an admin explicitly approved it
 * (manualPriceApproved). Unlinked products have no ERP price by definition and keep
 * their existing behaviour.
 */
export type PriceValidityFields = {
  externalId: string | null
  erpPriceMissing: boolean
  manualPriceApproved: boolean
  /** Current Product.price (number or Prisma Decimal). */
  price: unknown
  /** The exact price the admin approved; the approval covers nothing else. */
  manualApprovedPrice: unknown
}

/** Cent-exact comparison of two money values (number, Decimal or numeric string). */
export function sameMoney(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || b === null || b === undefined) return false
  const x = Number(String(a))
  const y = Number(String(b))
  return Number.isFinite(x) && Number.isFinite(y) && Math.round(x * 100) === Math.round(y * 100)
}

/** Manual approval is valid only for the exact price that was approved. */
export function hasValidManualApproval(product: Pick<PriceValidityFields, 'manualPriceApproved' | 'price' | 'manualApprovedPrice'>): boolean {
  return product.manualPriceApproved && sameMoney(product.price, product.manualApprovedPrice)
}

export type SellabilityFields = PriceValidityFields & {
  isActive: boolean
  isDeleted: boolean
  stock: number
}

export function hasValidB2BPrice(product: PriceValidityFields): boolean {
  return !product.externalId || !product.erpPriceMissing || hasValidManualApproval(product)
}

/** Active, not deleted, priced — may be quoted and ordered (stock checked separately at reservation). */
export function isPurchasable(product: Omit<SellabilityFields, 'stock'>): boolean {
  return product.isActive && !product.isDeleted && hasValidB2BPrice(product)
}

export function isSellable(product: SellabilityFields): boolean {
  return isPurchasable(product) && product.stock > 0
}

/**
 * Prisma pre-filter for hasValidB2BPrice. Prisma cannot compare two columns here, so the
 * manual branch only checks the flag; every consumer re-checks rows with
 * hasValidB2BPrice (exact approved price) before quoting or selling.
 */
export const VALID_B2B_PRICE_WHERE = {
  OR: [{ externalId: null }, { erpPriceMissing: false }, { manualPriceApproved: true }],
}

/** Prisma filter equivalent of isPurchasable. Stock is guarded separately (stock >= quantity). */
export const PURCHASABLE_PRODUCT_WHERE = {
  isActive: true,
  isDeleted: false,
  ...VALID_B2B_PRICE_WHERE,
}

/** SQL equivalent of hasValidB2BPrice for raw queries on "Product". */
export const VALID_B2B_PRICE_SQL = `("externalId" IS NULL OR "erpPriceMissing" = false OR ("manualPriceApproved" = true AND "manualApprovedPrice" = price))`

/**
 * Storefront representation. Admin-only flags are dropped; a product without a valid
 * B2B price loses every monetary field (price, oldPrice, bulk tiers, campaign offers,
 * variant price adjustments) and is reported as not for sale with stock 0, so no UI
 * path can show the kept legacy price or offer add-to-cart.
 */
export function toStorefrontProduct(product: Product): Product {
  const { erpPriceMissing: _missing, manualPriceApproved: _approved, manualApprovedPrice: _approvedPrice, ...publicProduct } = product
  if (!product.priceUnavailable) return publicProduct
  return {
    ...redactProductPrices(publicProduct),
    badges: publicProduct.badges?.filter((badge) => badge !== 'sale'),
    priceUnavailable: true,
    stock: 0,
  }
}

export function toStorefrontProducts(products: Product[]): Product[] {
  return products.map(toStorefrontProduct)
}

/**
 * A manual price approval covers one specific local price. Any change of Product.price
 * through a general edit path revokes it; re-approval is a separate explicit action.
 */
export function approvalAfterPriceChange(
  current: { price: unknown; manualPriceApproved: boolean },
  nextPrice: unknown,
): { manualPriceApproved: false; manualApprovedPrice: null } | Record<string, never> {
  return current.manualPriceApproved && !sameMoney(current.price, nextPrice)
    ? { manualPriceApproved: false, manualApprovedPrice: null }
    : {}
}

/** Monetary fields an admin override must not supply for an ERP product without an ERP price. */
export const ERP_PRICE_LOCKED_OVERRIDE_FIELDS = ['price', 'oldPrice', 'bulkPricingTiers'] as const

/**
 * Which cart product ids are no longer sold, given the storefront answer for those ids.
 * Missing from the answer = inactive/deleted; `priceUnavailable` = no valid ERP B2B price.
 * Checkout rejects both server-side; this only keeps stale browser prices off the cart.
 */
export function findUnsellableCartIds(requestedIds: string[], products: Array<{ id: string; priceUnavailable?: boolean }>): string[] {
  const sellable = new Set(products.filter((product) => !product.priceUnavailable).map((product) => product.id))
  return requestedIds.filter((id) => !sellable.has(id))
}
