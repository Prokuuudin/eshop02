export type PromoCodeItem = {
  id: string
  code: string
  discount: number
  discountType: 'percentage' | 'fixed'
  discountValue: number | null
  maxDiscount: number | null
  minOrder: number
  minEligibleAmount: number
  maxUses: number | null
  usedCount: number
  expiresAt: string | null
  startsAt: string | null
  perUserLimit: number | null
  appliesTo: 'all' | 'products' | 'brands' | 'categories' | 'rules'
  productIds: string[]
  brands: string[]
  categories: string[]
  subcategories: string[]
  excludedProductIds: string[]
  excludeSaleItems: boolean
  firstOrderOnly: boolean
  active: boolean
  description: string
}

export type PromoCodeForm = Omit<PromoCodeItem, 'id'>

export const emptyPromoForm = (): PromoCodeForm => ({
  code: '', discount: 10, discountType: 'percentage', discountValue: 10, maxDiscount: null,
  minOrder: 0, minEligibleAmount: 0, maxUses: null, usedCount: 0, expiresAt: null,
  startsAt: null, perUserLimit: null, appliesTo: 'all', productIds: [], brands: [],
  categories: [], subcategories: [], excludedProductIds: [], excludeSaleItems: false,
  firstOrderOnly: false, active: true, description: '',
})

export function normalizePromoCodeItem(item: Partial<PromoCodeItem>): PromoCodeItem {
  return {
    ...item,
    discountType: item.discountType ?? 'percentage',
    discountValue: item.discountValue ?? item.discount ?? 0,
    minEligibleAmount: item.minEligibleAmount ?? 0,
    appliesTo: item.appliesTo ?? 'all',
    productIds: item.productIds ?? [],
    brands: item.brands ?? [],
    categories: item.categories ?? [],
    subcategories: item.subcategories ?? [],
    excludedProductIds: item.excludedProductIds ?? [],
    excludeSaleItems: item.excludeSaleItems ?? false,
    firstOrderOnly: item.firstOrderOnly ?? false,
  } as PromoCodeItem
}

export function promoFormFromItem(item: PromoCodeItem): PromoCodeForm {
  const { id: _id, ...form } = normalizePromoCodeItem(item)
  return form
}

export function isPromoScopeEmpty(form: PromoCodeForm): boolean {
  if (form.appliesTo === 'products') return form.productIds.length === 0
  if (form.appliesTo === 'brands') return form.brands.length === 0
  if (form.appliesTo === 'categories') return form.categories.length === 0
  if (form.appliesTo === 'rules') return form.brands.length + form.categories.length + form.subcategories.length === 0
  return false
}
