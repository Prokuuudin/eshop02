import 'server-only'
import type { ExtendedTransactionClient } from '@/lib/prisma'
import type { ResolvedLineItem } from '@/lib/server-pricing'
import { calculateDiscount } from '@/lib/promo-codes'

export const PROMO_CAMPAIGNS_KEY = 'promo-campaigns'

export type PromoCampaign = {
  id: string
  name: string
  description: string
  type: 'discount' | 'gift' | 'bundle' | 'free_shipping'
  discountPercent: number
  startDate: string
  endDate: string
  active: boolean
  targetCategories: string[]
  targetSubcategories: string[]
  targetBrands: string[]
  minOrderAmount: number
  createdAt: string
  updatedAt: string
}

type CampaignDb = Pick<ExtendedTransactionClient, 'keyValueSetting'>

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
  const row = await db.keyValueSetting.findUnique({ where: { key: PROMO_CAMPAIGNS_KEY } })
  const campaigns = Array.isArray(row?.value) ? row.value as unknown as PromoCampaign[] : []
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  let best: CampaignResult = { discount: 0, eligibleAmount: 0, freeShipping: false }

  for (const campaign of campaigns) {
    if (!campaign?.active || !campaign.startDate || now < new Date(campaign.startDate)) continue
    if (campaign.endDate && now > new Date(`${campaign.endDate.slice(0, 10)}T23:59:59.999`)) continue
    if (subtotal < Math.max(0, Number(campaign.minOrderAmount) || 0)) continue
    if (campaign.type !== 'discount' && campaign.type !== 'free_shipping') continue

    const categories = Array.isArray(campaign.targetCategories) ? campaign.targetCategories : []
    const subcategories = Array.isArray(campaign.targetSubcategories) ? campaign.targetSubcategories : []
    const brands = Array.isArray(campaign.targetBrands) ? campaign.targetBrands : []
    const eligibleItems = items.filter((item) => {
      if (!item.fromCatalog) return false
      if (categories.length > 0 && !categories.includes(item.category ?? '')) return false
      if (subcategories.length > 0 && !subcategories.includes(item.subcategory ?? '')) return false
      if (brands.length > 0 && !brands.some((brand) => brand.toLowerCase() === (item.brand ?? '').toLowerCase())) return false
      return true
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
