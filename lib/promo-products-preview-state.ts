export type PromoPreviewPayload = {
  appliesTo: 'all' | 'products' | 'brands' | 'brand_lines' | 'categories' | 'rules'
  categories: string[]
  subcategories: string[]
  brands: string[]
  brandLineIds: string[]
  productIds: string[]
  excludedProductIds: string[]
  excludeSaleItems: boolean
}

export type PromoPreviewResult<T> = T & { payloadKey: string }

/** One stable value is used both as the request body and the effect dependency. */
export function promoPreviewPayloadKey(payload: PromoPreviewPayload): string {
  return JSON.stringify(payload)
}

/** Results from another filter selection are hidden immediately. */
export function currentPromoPreviewResult<T>(result: PromoPreviewResult<T> | null, payloadKey: string): PromoPreviewResult<T> | null {
  return result?.payloadKey === payloadKey ? result : null
}
