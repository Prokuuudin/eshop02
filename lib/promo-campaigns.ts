import 'server-only'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import type { ResolvedLineItem } from '@/lib/server-pricing'
import { calculateDiscount } from '@/lib/promo-codes'
import type { Product } from '@/data/products'
import { loadEffectiveBrandLines, selectionMatches, type BrandLineMembershipDb, type EffectiveBrandLines } from '@/lib/brand-lines/brand-line-membership'
import {
  calculateSecondItemCampaigns,
  findOverlappingSecondItemCampaign,
  isSecondItemCampaignActive,
  normalizeSecondItemSettings,
  isSecondItemProductEligible,
  SECOND_ITEM_DISCOUNT_TYPE,
  type SecondItemSettings,
} from '@/lib/second-item-discount'

export const PROMO_CAMPAIGNS_KEY = 'promo-campaigns'

export type PromoCampaign = {
  id: string
  name: string
  description: string
  type: 'discount' | 'gift' | 'bundle' | 'free_shipping' | typeof SECOND_ITEM_DISCOUNT_TYPE
  discountPercent: number
  showOldPrice?: boolean
  startDate: string
  endDate: string
  active: boolean
  targetCategories: string[]
  targetSubcategories: string[]
  targetBrands: string[]
  /** Product lines (BrandLine ids); a selected line covers its whole subtree. */
  targetBrandLineIds?: string[]
  minOrderAmount: number
  /** second_item_discount only (see lib/second-item-discount.ts). */
  productIds?: string[]
  excludedProductIds?: string[]
  excludeSaleItems?: boolean
  maxPairs?: number | null
  createdAt: string
  updatedAt: string
}

type CampaignDb = Pick<ExtendedTransactionClient, 'keyValueSetting'> & BrandLineMembershipDb

/** Calendar day (YYYY-MM-DD) in the server's local time, the time zone campaign dates are read in. */
function localDay(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * A campaign whose start date is still ahead is scheduled and always armed: it goes live
 * by its dates without anyone switching it on. Pausing applies once it has started.
 */
export function campaignActiveFlag(startDate: string, requested: unknown, now = new Date()): boolean {
  return startDate.slice(0, 10) > localDay(now) || requested !== false
}

export function isCampaignActive(campaign: PromoCampaign, now = new Date()): boolean {
  // Second-item campaigns are dated in Europe/Riga regardless of the server time zone.
  if (campaign.type === SECOND_ITEM_DISCOUNT_TYPE) return isSecondItemCampaignActive(campaign, now)
  // Both ends are local calendar days: the campaign runs from 00:00 of startDate to the end of endDate.
  const start = new Date(`${String(campaign.startDate ?? '').slice(0, 10)}T00:00:00`)
  const end = campaign.endDate ? new Date(`${campaign.endDate.slice(0, 10)}T23:59:59.999`) : null
  return !!campaign.active && Number.isFinite(start.getTime()) && now >= start
    && (!end || (Number.isFinite(end.getTime()) && now <= end))
}

export function campaignBrandLineIds(campaign: PromoCampaign): string[] {
  return Array.isArray(campaign.targetBrandLineIds) ? campaign.targetBrandLineIds : []
}

export function campaignMatchesProduct(
  campaign: PromoCampaign,
  product: { brand?: string; category?: string; subcategory?: string },
  effectiveBrandLines?: ReadonlySet<string>,
): boolean {
  const brandLineIds = campaignBrandLineIds(campaign)
  if (brandLineIds.length > 0 && !selectionMatches(brandLineIds, effectiveBrandLines)) return false
  const categories = Array.isArray(campaign.targetCategories) ? campaign.targetCategories : []
  const subcategories = Array.isArray(campaign.targetSubcategories) ? campaign.targetSubcategories : []
  const brands = Array.isArray(campaign.targetBrands) ? campaign.targetBrands : []
  const normalizeBrand = (value: string) => value.trim().replace(/\s+/g, ' ').toLowerCase()
  return (!categories.length || categories.includes(product.category ?? ''))
    && (!subcategories.length || subcategories.includes(product.subcategory ?? ''))
    && (!brands.length || brands.some((brand) => normalizeBrand(brand) === normalizeBrand(product.brand ?? '')))
}

export type SavableCampaignType = 'discount' | 'free_shipping' | typeof SECOND_ITEM_DISCOUNT_TYPE

/** Campaign types the admin API can create or edit (gift/bundle are not implemented). */
export function parseCampaignType(value: unknown): SavableCampaignType | null {
  return value === 'discount' || value === 'free_shipping' || value === SECOND_ITEM_DISCOUNT_TYPE ? value : null
}

/** Fields a saved campaign keeps only while it is a second-item campaign. */
export const SECOND_ITEM_ONLY_FIELDS = { productIds: undefined, excludedProductIds: undefined, excludeSaleItems: undefined, maxPairs: undefined }

/**
 * Validates admin input for a second-item campaign against the other saved campaigns.
 * The returned fields replace every targeting field: only one brand and product lists apply.
 */
export function validateSecondItemCampaignInput(
  input: Record<string, unknown>,
  campaigns: readonly PromoCampaign[],
  candidate: { id?: string; startDate: string; endDate: string },
):
  | { ok: true; fields: Pick<PromoCampaign, 'targetBrands' | 'discountPercent' | 'productIds' | 'excludedProductIds' | 'excludeSaleItems' | 'maxPairs' | 'targetCategories' | 'targetSubcategories' | 'targetBrandLineIds' | 'showOldPrice'> }
  | { ok: false; status: number; body: Record<string, unknown> } {
  const settings = normalizeSecondItemSettings(input)
  if (!settings.ok) return { ok: false, status: 400, body: { error: settings.error } }
  const overlap = findOverlappingSecondItemCampaign(campaigns, { ...candidate, targetBrands: settings.value.targetBrands })
  if (overlap) return { ok: false, status: 409, body: { error: 'overlapping_second_item_campaign', id: overlap.id, name: overlap.name } }
  return {
    ok: true,
    fields: { ...settings.value, targetCategories: [], targetSubcategories: [], targetBrandLineIds: [], showOldPrice: false },
  }
}

export async function readPromoCampaigns(db: CampaignDb): Promise<PromoCampaign[]> {
  const row = await db.keyValueSetting.findUnique({ where: { key: PROMO_CAMPAIGNS_KEY } })
  return Array.isArray(row?.value) ? row.value as unknown as PromoCampaign[] : []
}

/**
 * Membership needed to show line-targeted campaign offers; undefined (and no query)
 * when no active campaign targets product lines.
 */
export async function loadCampaignBrandLines(
  db: BrandLineMembershipDb,
  campaigns: PromoCampaign[],
  productIds: readonly string[],
  now = new Date(),
): Promise<EffectiveBrandLines | undefined> {
  const needed = campaigns.some((campaign) => campaign && isCampaignActive(campaign, now) && campaignBrandLineIds(campaign).length > 0)
  return needed ? loadEffectiveBrandLines(db, productIds) : undefined
}

export function isSecondItemCampaign(campaign: PromoCampaign): campaign is PromoCampaign & SecondItemSettings {
  return campaign?.type === SECOND_ITEM_DISCOUNT_TYPE
}

/** Deterministic order in which second-item campaigns claim cart lines. */
export function sortSecondItemCampaigns<T extends PromoCampaign>(campaigns: T[]): T[] {
  return [...campaigns].sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')) || a.id.localeCompare(b.id))
}

/** Campaign offers are display metadata; catalog/cart prices stay authoritative. */
export function attachCampaignOffers(products: Product[], campaigns: PromoCampaign[], now = new Date(), brandLines?: EffectiveBrandLines): Product[] {
  const active = campaigns.filter((campaign) => isCampaignActive(campaign, now)
    && campaign.type === 'discount' && Number.isFinite(campaign.discountPercent) && campaign.discountPercent > 0)
  const secondItem = campaigns.filter((campaign) => isSecondItemCampaign(campaign) && isCampaignActive(campaign, now)
    && Number.isInteger(campaign.discountPercent) && campaign.discountPercent >= 1 && campaign.discountPercent <= 100)
  return products.map((product) => ({
    ...product,
    // A badge only: the product price never changes, the discount is applied to the cart.
    ...(secondItem.length > 0 ? {
      secondItemOffers: secondItem.filter((campaign) => isSecondItemProductEligible(campaign, product)).map((campaign) => ({
        id: campaign.id,
        discountPercent: campaign.discountPercent,
        minOrderAmount: Math.max(0, Number(campaign.minOrderAmount) || 0),
        ...(campaign.name ? { name: campaign.name } : {}),
      })),
    } : {}),
    campaignOffers: active.filter((campaign) => campaignMatchesProduct(campaign, product, brandLines?.get(product.id))).map((campaign) => ({
      id: campaign.id,
      discountPercent: Math.min(100, campaign.discountPercent),
      minOrderAmount: Math.max(0, Number(campaign.minOrderAmount) || 0),
      ...(campaign.name ? { name: campaign.name } : {}),
      ...(campaign.showOldPrice !== undefined ? { showOldPrice: campaign.showOldPrice } : {}),
    })).sort((a, b) => b.discountPercent - a.discountPercent),
  }))
}

/** attachCampaignOffers with the product-line membership that line-targeted campaigns need. */
export async function attachCampaignOffersFromDb(db: BrandLineMembershipDb, products: Product[], campaigns: PromoCampaign[], now = new Date()): Promise<Product[]> {
  return attachCampaignOffers(products, campaigns, now, await loadCampaignBrandLines(db, campaigns, products.map((product) => product.id), now))
}

export type CampaignLineDiscount = {
  /** Index into the evaluated item list. */
  index: number
  campaignId: string
  discountedUnits: number
  /** Euros, exact cents. */
  discount: number
}

export type CampaignResult = {
  campaignId?: string
  campaignName?: string
  discount: number
  eligibleAmount: number
  freeShipping: boolean
  /** Per-line split; only second-item campaigns produce one. */
  lineDiscounts?: CampaignLineDiscount[]
}

export async function evaluatePromoCampaigns(
  items: ResolvedLineItem[],
  db: CampaignDb,
  now = new Date(),
): Promise<CampaignResult> {
  const campaigns = await readPromoCampaigns(db)
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  let best: CampaignResult = { discount: 0, eligibleAmount: 0, freeShipping: false }
  const brandLines = await loadCampaignBrandLines(db, campaigns, items.map((item) => item.id), now)

  for (const campaign of campaigns) {
    if (!campaign || !isCampaignActive(campaign, now)) continue
    if (subtotal < Math.max(0, Number(campaign.minOrderAmount) || 0)) continue
    if (campaign.type !== 'discount' && campaign.type !== 'free_shipping') continue

    const eligibleItems = items.filter((item) => {
      return item.fromCatalog && campaignMatchesProduct(campaign, item, brandLines?.get(item.id))
    })
    const eligibleAmount = Math.round(eligibleItems.reduce((sum, item) => sum + item.price * item.quantity, 0) * 100) / 100
    if (eligibleAmount <= 0) continue

    const discount = campaign.type === 'discount'
      ? calculateDiscount(eligibleAmount, Math.min(100, Math.max(0, Number(campaign.discountPercent) || 0)))
      : 0
    if (campaign.type === 'discount' && discount > best.discount) {
      best = { ...best, campaignId: campaign.id, campaignName: campaign.name, discount, eligibleAmount }
    }
    if (campaign.type === 'free_shipping' && !best.freeShipping) {
      best = {
        ...best,
        campaignId: best.campaignId ?? campaign.id,
        campaignName: best.campaignName ?? campaign.name,
        eligibleAmount: Math.max(best.eligibleAmount, eligibleAmount),
        freeShipping: true,
      }
    }
  }

  // Second-item campaigns of different brands add up; together they compete with the best
  // percentage campaign (and, in server-pricing, with the promo code) as one discount.
  const secondItemCampaigns = sortSecondItemCampaigns(campaigns
    .filter((campaign) => isSecondItemCampaign(campaign) && isCampaignActive(campaign, now)
      && subtotal >= Math.max(0, Number(campaign.minOrderAmount) || 0)))
  if (secondItemCampaigns.length > 0) {
    const secondItem = calculateSecondItemCampaigns(secondItemCampaigns, items)
    if (secondItem.discountCents / 100 > best.discount) {
      const applied = secondItemCampaigns.filter((campaign) => secondItem.campaignIds.includes(campaign.id))
      best = {
        ...best,
        campaignId: applied[0].id,
        campaignName: applied.map((campaign) => campaign.name).filter(Boolean).join(', ') || undefined,
        discount: secondItem.discountCents / 100,
        eligibleAmount: secondItem.eligibleCents / 100,
        lineDiscounts: secondItem.lines.map((line) => ({
          index: line.index,
          campaignId: line.campaignId,
          discountedUnits: line.discountedUnits,
          discount: line.discountCents / 100,
        })),
      }
    }
  }

  return best
}
