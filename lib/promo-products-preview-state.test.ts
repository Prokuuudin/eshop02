import { describe, expect, it } from 'vitest'
import { currentPromoPreviewResult, promoPreviewPayloadKey, type PromoPreviewPayload } from './promo-products-preview-state'

const payload = (brandLineIds: string[] = []): PromoPreviewPayload => ({
  appliesTo: 'rules', categories: [], subcategories: [], brands: [], brandLineIds,
  productIds: [], excludedProductIds: [], excludeSaleItems: false,
})

describe('promo preview request state', () => {
  it('keeps an empty result current when equivalent default arrays are recreated', () => {
    const firstKey = promoPreviewPayloadKey(payload(['keratin']))
    const nextKey = promoPreviewPayloadKey(payload(['keratin']))
    const emptyResult = { payloadKey: firstKey, total: 0, products: [] }

    expect(nextKey).toBe(firstKey)
    expect(currentPromoPreviewResult(emptyResult, nextKey)).toBe(emptyResult)
  })

  it('hides stale results during rapid filter changes and accepts only the latest response', () => {
    const firstKey = promoPreviewPayloadKey(payload(['keratin']))
    const nextKey = promoPreviewPayloadKey(payload(['premium']))
    const stale = { payloadKey: firstKey, total: 2229, products: [] }
    const latest = { payloadKey: nextKey, total: 0, products: [] }

    expect(currentPromoPreviewResult(stale, nextKey)).toBeNull()
    expect(currentPromoPreviewResult(latest, nextKey)).toBe(latest)
  })
})
