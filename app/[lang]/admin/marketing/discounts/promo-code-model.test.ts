import { describe, expect, it } from 'vitest'
import { emptyPromoForm, isPromoScopeEmpty, normalizePromoCodeItem, promoFormFromItem } from './promo-code-model'

describe('promo code model', () => {
  it('provides stable defaults for legacy API records', () => {
    const promo = normalizePromoCodeItem({ id: '1', code: 'SAVE', discount: 15 })

    expect(promo.discountType).toBe('percentage')
    expect(promo.discountValue).toBe(15)
    expect(promo.appliesTo).toBe('all')
    expect(promo.productIds).toEqual([])
    expect(promo.excludeSaleItems).toBe(false)
  })

  it('creates an editable form without carrying the database id', () => {
    const promo = normalizePromoCodeItem({ id: '1', code: 'SAVE', discount: 15 })

    expect(promoFormFromItem(promo)).not.toHaveProperty('id')
    expect(promoFormFromItem(promo).code).toBe('SAVE')
  })

  it('requires targets only for scoped promotions', () => {
    const form = emptyPromoForm()
    expect(isPromoScopeEmpty(form)).toBe(false)
    expect(isPromoScopeEmpty({ ...form, appliesTo: 'products' })).toBe(true)
    expect(isPromoScopeEmpty({ ...form, appliesTo: 'products', productIds: ['product-1'] })).toBe(false)
    expect(isPromoScopeEmpty({ ...form, appliesTo: 'rules', brands: ['Brand'] })).toBe(false)
  })
})
