import { describe, expect, it } from 'vitest'
import type { Product } from '@/data/products'
import {
  approvalAfterPriceChange,
  hasValidB2BPrice,
  isPurchasable,
  findUnsellableCartIds,
  isSellable,
  PURCHASABLE_PRODUCT_WHERE,
  sameMoney,
  toStorefrontProduct,
} from './product-sellability'

const erp = { externalId: 'SDO3', erpPriceMissing: false, manualPriceApproved: false, manualApprovedPrice: null as unknown, price: 12 as unknown, isActive: true, isDeleted: false, stock: 4 }

const storefront = (overrides: Partial<Product> = {}): Product => ({
  id: 'p1', title: 'Shampoo', brand: 'Brand', category: 'hair', rating: 0, stock: 2,
  price: 12, oldPrice: 15, badges: ['sale', 'new'],
  bulkPricingTiers: [{ quantity: 10, pricePerUnit: 10 }],
  campaignOffers: [{ id: 'c1', discountPercent: 20, minOrderAmount: 0 }],
  bonusRate: 5,
  ...overrides,
})

describe('ERP B2B price validity', () => {
  it('A: ERP product with price2 > 0 is sellable under normal conditions', () => {
    expect(hasValidB2BPrice(erp)).toBe(true)
    expect(isSellable(erp)).toBe(true)
  })

  it('B: ERP product with price2 = 0 has no valid B2B price and is not sellable', () => {
    const missing = { ...erp, erpPriceMissing: true }
    expect(hasValidB2BPrice(missing)).toBe(false)
    expect(isPurchasable(missing)).toBe(false)
    expect(isSellable(missing)).toBe(false)
  })

  it('C: explicit manual approval of the current price makes it valid when active and in stock', () => {
    const approved = { ...erp, erpPriceMissing: true, manualPriceApproved: true, manualApprovedPrice: '12.00' }
    expect(hasValidB2BPrice(approved)).toBe(true)
    expect(isSellable(approved)).toBe(true)
    expect(isSellable({ ...approved, stock: 0 })).toBe(false)
    expect(isSellable({ ...approved, isActive: false })).toBe(false)
  })

  it('an approval never covers a price other than the approved one', () => {
    const base = { ...erp, erpPriceMissing: true, manualPriceApproved: true }
    expect(hasValidB2BPrice({ ...base, price: 31.5, manualApprovedPrice: 31.5 })).toBe(true)
    expect(hasValidB2BPrice({ ...base, price: 35.5, manualApprovedPrice: 31.5 })).toBe(false)
    expect(hasValidB2BPrice({ ...base, price: 31.5, manualApprovedPrice: null })).toBe(false)
    expect(hasValidB2BPrice({ ...base, manualPriceApproved: false, price: 31.5, manualApprovedPrice: 31.5 })).toBe(false)
  })

  it('compares money cent-exactly across number, Decimal-like and string values', () => {
    expect(sameMoney(31.5, '31.50')).toBe(true)
    expect(sameMoney({ toString: () => '31.50' }, 31.5)).toBe(true)
    expect(sameMoney(31.5, 31.51)).toBe(false)
    expect(sameMoney(31.5, null)).toBe(false)
  })

  it('E: inactive or deleted products are never purchasable, even with a normal price', () => {
    expect(isPurchasable({ ...erp, isActive: false })).toBe(false)
    expect(isPurchasable({ ...erp, isDeleted: true })).toBe(false)
  })

  it('I: an unlinked product (externalId = NULL) is not blocked by the ERP rule', () => {
    const local = { ...erp, externalId: null, erpPriceMissing: true }
    expect(hasValidB2BPrice(local)).toBe(true)
    expect(isSellable(local)).toBe(true)
  })

  it('exposes the same rule as a Prisma filter', () => {
    expect(PURCHASABLE_PRODUCT_WHERE).toEqual({
      isActive: true,
      isDeleted: false,
      OR: [{ externalId: null }, { erpPriceMissing: false }, { manualPriceApproved: true }],
    })
  })
})

describe('storefront representation', () => {
  it('B: hides every monetary field of a product without a valid B2B price', () => {
    const result = toStorefrontProduct(storefront({ priceUnavailable: true, erpPriceMissing: true, manualPriceApproved: false }))
    expect(result).not.toHaveProperty('price')
    expect(result).not.toHaveProperty('oldPrice')
    expect(result).not.toHaveProperty('bulkPricingTiers')
    expect(result).not.toHaveProperty('campaignOffers')
    expect(result).not.toHaveProperty('bonusRate')
    expect(result).not.toHaveProperty('erpPriceMissing')
    expect(result).not.toHaveProperty('manualPriceApproved')
    expect(result.badges).toEqual(['new'])
    expect(result).toMatchObject({ priceUnavailable: true, stock: 0 })
    expect(JSON.stringify(result)).not.toContain('12')
  })

  it('keeps prices of sellable products and drops only admin flags', () => {
    const result = toStorefrontProduct(storefront({ erpPriceMissing: true, manualPriceApproved: true }))
    expect(result).toMatchObject({ price: 12, oldPrice: 15, stock: 2 })
    expect(result.campaignOffers).toHaveLength(1)
    expect(result).not.toHaveProperty('erpPriceMissing')
    expect(result).not.toHaveProperty('manualPriceApproved')
    expect(result.priceUnavailable).toBeUndefined()
  })
})

describe('manual approval lifetime', () => {
  it('revokes an approval when the local price changes', () => {
    expect(approvalAfterPriceChange({ price: '31.50', manualPriceApproved: true }, 35.5)).toEqual({ manualPriceApproved: false, manualApprovedPrice: null })
  })

  it('keeps an approval when the price is unchanged and never grants one', () => {
    expect(approvalAfterPriceChange({ price: '31.50', manualPriceApproved: true }, 31.5)).toEqual({})
    expect(approvalAfterPriceChange({ price: '12.00', manualPriceApproved: false }, 7)).toEqual({})
  })
})

describe('stale browser cart', () => {
  it('flags products that are not for sale or no longer returned by the storefront', () => {
    expect(findUnsellableCartIds(['a', 'b', 'c'], [{ id: 'a' }, { id: 'b', priceUnavailable: true }])).toEqual(['b', 'c'])
    expect(findUnsellableCartIds(['a'], [{ id: 'a' }])).toEqual([])
  })
})
