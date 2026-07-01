import { describe, expect, it } from 'vitest'
import {
  getDisplayPrice,
  calculatePrice,
  getMinimumOrderQuantity,
  getWholesaleOrderGuard,
  getDefaultMinQuantity,
  type RoleBasedPricingProduct,
  type RoleBasedMinOrderProduct
} from '@/lib/customer-segmentation'

describe('getDisplayPrice', () => {
  it('returns the rounded price for a normal value', () => {
    expect(getDisplayPrice(1200)).toBe(1200)
  })

  it('rounds to the nearest cent, not the nearest euro', () => {
    expect(getDisplayPrice(99.456)).toBe(99.46)
    expect(getDisplayPrice(99.454)).toBe(99.45)
    expect(getDisplayPrice(17.4999)).toBe(17.5)
  })

  it('clamps negative prices to 0', () => {
    expect(getDisplayPrice(-50)).toBe(0)
  })

  it('returns 0 for 0 input', () => {
    expect(getDisplayPrice(0)).toBe(0)
  })
})

describe('calculatePrice', () => {
  const baseProduct: RoleBasedPricingProduct = {
    price: 1000
  }

  const tieredProduct: RoleBasedPricingProduct = {
    price: 1000,
    bulkPricingTiers: [
      { quantity: 10, pricePerUnit: 900 },
      { quantity: 50, pricePerUnit: 800 }
    ]
  }

  it('returns base price when no tiers and quantity is 1', () => {
    expect(calculatePrice(baseProduct, 1)).toBe(1000)
  })

  it('returns base price when quantity is below first tier threshold', () => {
    expect(calculatePrice(tieredProduct, 9)).toBe(1000)
  })

  it('applies first tier price when quantity meets first tier', () => {
    expect(calculatePrice(tieredProduct, 10)).toBe(900)
  })

  it('applies highest matching tier price', () => {
    expect(calculatePrice(tieredProduct, 50)).toBe(800)
  })

  it('applies highest tier for quantity above all thresholds', () => {
    expect(calculatePrice(tieredProduct, 100)).toBe(800)
  })

  it('never returns a negative price', () => {
    const negativeProduct: RoleBasedPricingProduct = { price: -500 }
    expect(calculatePrice(negativeProduct, 1)).toBe(0)
  })

  it('handles product with empty bulkPricingTiers array', () => {
    const product: RoleBasedPricingProduct = { price: 750, bulkPricingTiers: [] }
    expect(calculatePrice(product, 100)).toBe(750)
  })
})

describe('getMinimumOrderQuantity', () => {
  it('returns 1 when product has no minOrderQuantities', () => {
    const product: RoleBasedMinOrderProduct = {}
    expect(getMinimumOrderQuantity(product)).toBe(1)
  })

  it('returns 1 when minOrderQuantities is an empty object', () => {
    const product: RoleBasedMinOrderProduct = { minOrderQuantities: {} }
    expect(getMinimumOrderQuantity(product)).toBe(1)
  })

  it('returns the explicit minimum quantity', () => {
    const product: RoleBasedMinOrderProduct = { minOrderQuantities: { default: 5 } }
    expect(getMinimumOrderQuantity(product)).toBe(5)
  })

  it('returns the lowest value among multiple keys', () => {
    const product: RoleBasedMinOrderProduct = {
      minOrderQuantities: { retail: 3, wholesale: 10 }
    }
    expect(getMinimumOrderQuantity(product)).toBe(3)
  })

  it('ignores values below 1', () => {
    const product: RoleBasedMinOrderProduct = {
      minOrderQuantities: { a: 0, b: 5 }
    }
    expect(getMinimumOrderQuantity(product)).toBe(5)
  })
})

describe('getWholesaleOrderGuard', () => {
  it('isMinimumReached is always true (minOrderAmount is 0)', () => {
    const guard = getWholesaleOrderGuard(0)
    expect(guard.isMinimumReached).toBe(true)
  })

  it('shortage is 0 because minOrderAmount is 0', () => {
    const guard = getWholesaleOrderGuard(500)
    expect(guard.shortage).toBe(0)
  })

  it('isWholesaleRole is false', () => {
    const guard = getWholesaleOrderGuard(1000)
    expect(guard.isWholesaleRole).toBe(false)
  })

  it('minOrderAmount is 0', () => {
    const guard = getWholesaleOrderGuard(100)
    expect(guard.minOrderAmount).toBe(0)
  })
})

describe('getDefaultMinQuantity', () => {
  it('returns 1', () => {
    expect(getDefaultMinQuantity()).toBe(1)
  })
})
