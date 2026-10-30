import 'server-only'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import type { ResolvedLineItem } from '@/lib/server-pricing'
import { calculateDiscount } from '@/lib/promo-codes'
import type { Product } from '@/data/products'
import { loadEffectiveBrandLines, selectionMatches, type BrandLineMembershipDb, type EffectiveBrandLines } from '@/lib/brand-lines/brand-line-membership'

export const PROMO_CAMPAIGNS_KEY = 'promo-campaigns'

export type PromoCampaign = {
  id: string
  name: string
  description: string
  type: 'discount' | 'gift' | 'bundle' | 'free_shipping'
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
  createdAt: string
  updatedAt: string
}

type CampaignDb = Pick<ExtendedTransactionClient, 'keyValueSetting'> & BrandLineMembershipDb

export function isCampaignActive(campaign: PromoCampaign, now = new Date()): boolean {
  const start = new Date(campaign.startDate)
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

/** Campaign offers are display metadata; catalog/cart prices stay authoritative. */
export function attachCampaignOffers(products: Product[], campaigns: PromoCampaign[], now = new Date(), brandLines?: EffectiveBrandLines): Product[] {
  const active = campaigns.filter((campaign) => isCampaignActive(campaign, now)
    && campaign.type === 'discount' && Number.isFinite(campaign.discountPercent) && campaign.discountPercent > 0)
  return products.map((product) => ({
    ...product,
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

export type CampaignResult = {
  campaignId?: string
  campaignName?: string
  discount: number
  eligibleAmount: number
  freeShipping: boolean
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

  return best
}
