import { describe, expect, it } from 'vitest'
import { redactProductPrices } from './product-price-visibility'

describe('redactProductPrices', () => {
  it('removes direct and nested monetary catalog fields without mutating input', () => {
    const product = {
      id: 'p1',
      title: 'Shampoo',
      price: 19.99,
      oldPrice: 24.99,
      bonusRate: 5,
      discountPercent: 10,
      bulkPricingTiers: [{ quantity: 10, pricePerUnit: 15 }],
      variantGroups: [{
        name: 'Size',
        options: [{ value: 'Large', priceAdjustment: 3 }],
      }],
    }

    const result = redactProductPrices(product) as Record<string, unknown>

    expect(result).not.toHaveProperty('price')
    expect(result).not.toHaveProperty('oldPrice')
    expect(result).not.toHaveProperty('bonusRate')
    expect(result).not.toHaveProperty('discountPercent')
    expect(result).not.toHaveProperty('bulkPricingTiers')
    expect(result).not.toHaveProperty('variantGroups.0.options.0.priceAdjustment')
    expect(result).toHaveProperty('variantGroups.0.options.0.value', 'Large')
    expect(product.price).toBe(19.99)
  })
})
