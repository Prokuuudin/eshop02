import { describe, it, expect, vi, beforeEach } from 'vitest'

const {
  productFindManyMock,
  promoCodeFindFirstMock,
  keyValueSettingFindUniqueMock,
} = vi.hoisted(() => ({
  productFindManyMock: vi.fn(),
  promoCodeFindFirstMock: vi.fn(),
  keyValueSettingFindUniqueMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: productFindManyMock },
    promoCode: { findFirst: promoCodeFindFirstMock },
    keyValueSetting: { findUnique: keyValueSettingFindUniqueMock },
  },
}))

import {
  resolveLineItems,
  getServerPromoDiscountPct,
  recomputeOrderPricing,
  evaluatePromoCode,
} from './server-pricing'

beforeEach(() => vi.clearAllMocks())

describe('resolveLineItems', () => {
  it('uses catalog price and ignores client-supplied price', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    const items = await resolveLineItems([{ id: 'p1', quantity: 2, price: 1 }])
    expect(items[0].price).toBe(1000)
    expect(items[0].fromCatalog).toBe(true)
  })

  it('applies bulk tier pricing by quantity', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: [{ quantity: 10, pricePerUnit: 800 }] },
    ])
    const cheap = await resolveLineItems([{ id: 'p1', quantity: 5 }])
    expect(cheap[0].price).toBe(1000)
    const bulk = await resolveLineItems([{ id: 'p1', quantity: 12 }])
    expect(bulk[0].price).toBe(800)
  })

  it('falls back to sanitized client price when product missing from catalog', async () => {
    productFindManyMock.mockResolvedValue([])
    const items = await resolveLineItems([{ id: 'ghost', quantity: 1, price: 500 }])
    expect(items[0].price).toBe(500)
    expect(items[0].fromCatalog).toBe(false)
  })

  it('clamps negative client fallback price to 0', async () => {
    productFindManyMock.mockResolvedValue([])
    const items = await resolveLineItems([{ id: 'ghost', quantity: 1, price: -999 }])
    expect(items[0].price).toBe(0)
  })
})

describe('getServerPromoDiscountPct', () => {
  it('returns 0 for empty code', async () => {
    expect(await getServerPromoDiscountPct('', 1000)).toBe(0)
  })

  it('returns 0 when minOrder not met', async () => {
    promoCodeFindFirstMock.mockResolvedValue({
      code: 'SPRING20', discount: 20, minOrder: 2000, maxUses: null, usedCount: 0, expiresAt: null,
    })
    expect(await getServerPromoDiscountPct('SPRING20', 1500)).toBe(0)
  })

  it('returns discount when valid', async () => {
    promoCodeFindFirstMock.mockResolvedValue({
      code: 'WELCOME10', discount: 10, minOrder: 0, maxUses: null, usedCount: 0, expiresAt: null,
    })
    expect(await getServerPromoDiscountPct('welcome10', 1000)).toBe(10)
  })

  it('returns 0 when maxUses exhausted', async () => {
    promoCodeFindFirstMock.mockResolvedValue({
      code: 'X', discount: 50, minOrder: 0, maxUses: 5, usedCount: 5, expiresAt: null,
    })
    expect(await getServerPromoDiscountPct('X', 1000)).toBe(0)
  })
})

describe('recomputeOrderPricing', () => {
  it('recomputes totals from catalog and ignores tampered prices', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 2, price: 1 }], // attacker tries price=1
      deliveryMethod: 'courier',
      userBonusBalance: null,
    })

    expect(r.subtotal).toBe(2000) // 1000 * 2, not 2
    expect(r.delivery).toBe(0) // free delivery from €100
    expect(r.tax).toBe(347.11) // VAT already included in price, extracted for display: 2000 - 2000/1.21
    expect(r.total).toBe(2000) // tax not added — it's already inside subtotal
  })

  it('charges the courier fee in euros below the free-delivery threshold', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 6, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'courier',
      userBonusBalance: null,
    })

    expect(r.delivery).toBe(5) // €5, not €500
    expect(r.total).toBe(11) // €6 order costs €11, not €506
  })

  it('applies free delivery from €100 of subtotal', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'courier',
      userBonusBalance: null,
    })

    expect(r.delivery).toBe(0)
    expect(r.total).toBe(100)
  })

  it('forbids bonus spend for guests (no balance)', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      bonusSpent: 9999,
      userBonusBalance: null,
    })
    expect(r.bonusSpent).toBe(0)
  })

  it('caps bonus spend at the real user balance; discount is points * point value', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      bonusSpent: 9999,
      userBonusBalance: 300,
    })
    expect(r.bonusSpent).toBe(300) // points
    expect(r.total).toBe(1000 - 3) // 300 points = €3.00; delivery free from €100
  })

  it('caps bonus spend at the order total converted to points', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 10, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      bonusSpent: 999999,
      userBonusBalance: 999999,
    })
    expect(r.bonusSpent).toBe(1000) // €10 order = max 1000 points
    expect(r.total).toBe(0)
  })

  it('computes bonusEarned from catalog bonusRate (no bonus spent)', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null, bonusRate: 5 },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 3 }],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })
    expect(r.bonusEarned).toBe(15) // 5 * 3
  })

  it('scales bonusEarned down when points are spent', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null, bonusRate: 10 },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    // grandTotal = 1000 (pickup); spend 50000 points = €500 -> total 500
    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      bonusSpent: 50000,
      userBonusBalance: 50000,
    })
    expect(r.bonusSpent).toBe(50000)
    expect(r.total).toBe(500)
    expect(r.bonusEarned).toBe(Math.round((10 * 500) / 1000)) // base 10 scaled = 5
  })

  it('falls back to 0.5% of item subtotal when bonusRate is null', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 200, bulkPricingTiers: null, bonusRate: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })
    expect(r.bonusEarned).toBe(100) // 0.5% of €200 = €1 = 100 points
  })

  it('earns visible points on a small order (€60 -> 30 points)', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 60, bulkPricingTiers: null, bonusRate: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })
    expect(r.bonusEarned).toBe(30) // 0.5% of €60 = €0.30 = 30 points
  })

  it('mixes explicit bonusRate items with percent-fallback items', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null, bonusRate: 10 },
      { id: 'p2', price: 200, bulkPricingTiers: null, bonusRate: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [
        { id: 'p1', quantity: 1 },
        { id: 'p2', quantity: 1 },
      ],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })
    expect(r.bonusEarned).toBe(110) // 10 + 100 (0.5% of €200 in points)
  })

  it('scales fallback earn down when points are spent', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 400, bulkPricingTiers: null, bonusRate: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    // base = 200 points; grandTotal €400 (pickup), spend 20000 points = €200 -> total €200
    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      bonusSpent: 20000,
      userBonusBalance: 20000,
    })
    expect(r.bonusEarned).toBe(100) // round(200 * 200 / 400)
  })

  it('applies a valid promo discount', async () => {
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue({
      code: 'WELCOME10', discount: 10, minOrder: 0, maxUses: null, usedCount: 0, expiresAt: null,
    })

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      promoCode: 'WELCOME10',
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })
    expect(r.discount).toBe(100)
    expect(r.promoApplied).toBe(true)
    expect(r.delivery).toBe(0)
    expect(r.tax).toBe(156.2) // VAT extracted for display: (1000-100) - 900/1.21
    expect(r.total).toBe(900) // tax already included, not added
  })
})

describe('evaluatePromoCode targeting', () => {
  it('ignores stale hidden filters after scope is changed to the entire cart', async () => {
    promoCodeFindFirstMock.mockResolvedValue({
      id: 'promo-all', code: 'ALL10', active: true, discount: 10, discountValue: 10,
      discountType: 'percentage', maxDiscount: null, minOrder: 0, minEligibleAmount: 0,
      maxUses: null, usedCount: 0, startsAt: null, expiresAt: null, perUserLimit: null,
      firstOrderOnly: false, appliesTo: 'all', brands: ['Stale brand'], categories: ['face'],
      subcategories: ['masks'], productIds: ['stale-id'], excludedProductIds: [], excludeSaleItems: false,
    })
    const result = await evaluatePromoCode('ALL10', [
      { id: 'p1', price: 100, quantity: 1, brand: 'Acme', category: 'hair', subcategory: 'shampoos', bonusRate: 0, fromCatalog: true },
    ])
    expect(result).toMatchObject({ valid: true, eligibleAmount: 100, discount: 10 })
  })

  it('combines brand and subcategory filters with AND semantics', async () => {
    promoCodeFindFirstMock.mockResolvedValue({
      id: 'promo-rules', code: 'ACME-SHAMPOO', active: true, discount: 10, discountValue: 10,
      discountType: 'percentage', maxDiscount: null, minOrder: 0, minEligibleAmount: 0,
      maxUses: null, usedCount: 0, startsAt: null, expiresAt: null, perUserLimit: null,
      firstOrderOnly: false, appliesTo: 'rules', brands: ['Acme'], categories: [], subcategories: ['shampoos'],
      productIds: [], excludedProductIds: [], excludeSaleItems: false,
    })
    const result = await evaluatePromoCode('ACME-SHAMPOO', [
      { id: 'p1', price: 100, quantity: 1, brand: 'Acme', category: 'hair', subcategory: 'shampoos', bonusRate: 0, fromCatalog: true },
      { id: 'p2', price: 200, quantity: 1, brand: 'Acme', category: 'hair', subcategory: 'masks', bonusRate: 0, fromCatalog: true },
      { id: 'p3', price: 300, quantity: 1, brand: 'Other', category: 'hair', subcategory: 'shampoos', bonusRate: 0, fromCatalog: true },
    ])
    expect(result).toMatchObject({ valid: true, eligibleAmount: 100, discount: 10 })
  })

  it('discounts only products of selected brands', async () => {
    promoCodeFindFirstMock.mockResolvedValue({
      id: 'promo-1', code: 'BRAND20', active: true, discount: 20, discountValue: 20,
      discountType: 'percentage', maxDiscount: null, minOrder: 0, minEligibleAmount: 0,
      maxUses: null, usedCount: 0, startsAt: null, expiresAt: null, perUserLimit: null,
      firstOrderOnly: false, appliesTo: 'brands', brands: ['Acme'], categories: [], productIds: [],
      excludedProductIds: [], excludeSaleItems: false,
    })
    const result = await evaluatePromoCode('BRAND20', [
      { id: 'p1', price: 100, quantity: 1, brand: 'Acme', category: 'hair', bonusRate: 0, fromCatalog: true },
      { id: 'p2', price: 200, quantity: 1, brand: 'Other', category: 'hair', bonusRate: 0, fromCatalog: true },
    ])
    expect(result).toMatchObject({ valid: true, eligibleAmount: 100, discount: 20 })
  })

  it('caps a fixed discount at the eligible subtotal and excludes sale items', async () => {
    promoCodeFindFirstMock.mockResolvedValue({
      id: 'promo-2', code: 'FIXED50', active: true, discount: 50, discountValue: 50,
      discountType: 'fixed', maxDiscount: null, minOrder: 0, minEligibleAmount: 0,
      maxUses: null, usedCount: 0, startsAt: null, expiresAt: null, perUserLimit: null,
      firstOrderOnly: false, appliesTo: 'all', brands: [], categories: [], productIds: [],
      excludedProductIds: [], excludeSaleItems: true,
    })
    const result = await evaluatePromoCode('FIXED50', [
      { id: 'sale', price: 40, oldPrice: 60, quantity: 1, brand: 'A', category: 'hair', bonusRate: 0, fromCatalog: true },
      { id: 'regular', price: 30, oldPrice: null, quantity: 1, brand: 'A', category: 'hair', bonusRate: 0, fromCatalog: true },
    ])
    expect(result).toMatchObject({ valid: true, eligibleAmount: 30, discount: 30 })
  })
})

describe('recomputeOrderPricing — admin-configured bonus program (KeyValueSetting)', () => {
  const mockBonusConfig = (value: Record<string, unknown> | null) => {
    keyValueSettingFindUniqueMock.mockResolvedValue(value ? { value } : null)
  }

  it('disables earning and spending entirely when the admin turns the program off', async () => {
    mockBonusConfig({ enabled: false })
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null, bonusRate: 10 },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      bonusSpent: 9999,
      userBonusBalance: 9999,
    })

    expect(r.bonusSpent).toBe(0)
    expect(r.bonusEarned).toBe(0)
  })

  it('caps bonus spend at the admin-configured max-spend-percent, not 100%', async () => {
    mockBonusConfig({ enabled: true, maxSpendPercent: 20 })
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      bonusSpent: 999999,
      userBonusBalance: 999999,
    })

    expect(r.bonusSpent).toBe(2000) // 20% of €100 = €20 = 2000 points
  })

  it('withholds earning below the admin-configured minimum order amount', async () => {
    mockBonusConfig({ enabled: true, minOrderForEarn: 500 })
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null, bonusRate: 10 },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })

    expect(r.bonusEarned).toBe(0)
  })

  it('caps bonusEarned at the admin-configured max-earn-per-order', async () => {
    mockBonusConfig({ enabled: true, maxEarnPerOrder: 50 })
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null, bonusRate: 1000 },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      userBonusBalance: null,
    })

    expect(r.bonusEarned).toBe(50)
  })

  it('blocks redemption when the balance is under the admin-configured minimum to spend', async () => {
    mockBonusConfig({ enabled: true, minPointsToSpend: 500 })
    productFindManyMock.mockResolvedValue([
      { id: 'p1', price: 100, bulkPricingTiers: null },
    ])
    promoCodeFindFirstMock.mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      deliveryMethod: 'pickup',
      bonusSpent: 100,
      userBonusBalance: 100,
    })

    expect(r.bonusSpent).toBe(0)
  })
})
