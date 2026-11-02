import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { attachCampaignOffers, attachCampaignOffersFromDb, campaignActiveFlag, evaluatePromoCampaigns, isCampaignActive, type PromoCampaign } from './promo-campaigns'
import type { Product } from '@/data/products'

const item = (category: string, price = 100) => ({
  id: `${category}-${price}`, quantity: 1, price, category,
  bonusRate: 0, fromCatalog: true,
})

function db(value: unknown, lines: unknown[] = [], links: unknown[] = []) {
  return {
    keyValueSetting: { findUnique: vi.fn().mockResolvedValue({ value }) },
    brandLine: { findMany: vi.fn().mockResolvedValue(lines) },
    productBrandLine: { findMany: vi.fn().mockResolvedValue(links) },
  } as never
}

describe('evaluatePromoCampaigns', () => {
  it('applies a 10% line campaign only to its one directly linked product', async () => {
    const campaign: PromoCampaign = {
      id: 'keratin-10', name: 'Keratin 10%', description: '', type: 'discount', discountPercent: 10,
      startDate: '2026-01-01', endDate: '', active: true, targetCategories: [], targetSubcategories: [], targetBrands: [],
      targetBrandLineIds: ['keratin'], minOrderAmount: 0, createdAt: '', updatedAt: '',
    }
    const database = db([campaign], [{ id: 'keratin', parentId: null }], [
      { productId: '19490', brandLineId: 'keratin', status: 'active' },
    ])

    const result = await evaluatePromoCampaigns([
      { id: '19490', quantity: 1, price: 100, bonusRate: 0, fromCatalog: true },
      { id: 'other-brand', quantity: 1, price: 200, bonusRate: 0, fromCatalog: true },
    ], database, new Date('2026-10-31T00:00:00Z'))

    expect(result).toMatchObject({ campaignId: 'keratin-10', eligibleAmount: 100, discount: 10 })
  })

  it('targets a parent line through child membership in checkout and storefront offers', async () => {
    const campaign: PromoCampaign = {
      id: 'line-sale', name: 'Line sale', description: '', type: 'discount', discountPercent: 15,
      startDate: '2026-01-01', endDate: '', active: true, targetCategories: [], targetSubcategories: [], targetBrands: [],
      targetBrandLineIds: ['parent'], minOrderAmount: 0, createdAt: '', updatedAt: '',
    }
    const database = db([campaign], [{ id: 'parent', parentId: null }, { id: 'child', parentId: 'parent' }], [
      { productId: 'p1', brandLineId: 'child', status: 'active' },
    ])
    const result = await evaluatePromoCampaigns([
      { id: 'p1', quantity: 1, price: 100, bonusRate: 0, fromCatalog: true },
      { id: 'p2', quantity: 1, price: 200, bonusRate: 0, fromCatalog: true },
    ], database, new Date('2026-08-23T12:00:00Z'))
    expect(result).toMatchObject({ campaignId: 'line-sale', eligibleAmount: 100, discount: 15 })

    const products = [{ id: 'p1', title: 'One', price: 100, category: 'hair', brand: 'Acme', rating: 0, stock: 1 }] as Product[]
    const [decorated] = await attachCampaignOffersFromDb(database, products, [campaign], new Date('2026-08-23T12:00:00Z'))
    expect(decorated.campaignOffers).toEqual([{ id: 'line-sale', name: 'Line sale', discountPercent: 15, minOrderAmount: 0 }])
  })

  it('shows BEAUTY IMAGE offers without changing the price used for order calculations', async () => {
    const campaign: PromoCampaign = {
      id: 'beauty', name: 'Beauty', description: '', type: 'discount', discountPercent: 20,
      startDate: '2026-09-01', endDate: '2026-09-30', active: true,
      targetCategories: [], targetSubcategories: [], targetBrands: [' BEAUTY iMAGE '],
      minOrderAmount: 0, createdAt: '', updatedAt: '',
    }
    const product = { ...item('body'), title: 'Wax', brand: 'BEAUTY IMAGE', stock: 10, rating: 0 } as Product
    const now = new Date('2026-09-18T12:00:00Z')
    const [decorated, other] = attachCampaignOffers([product, { ...product, id: 'other', brand: 'Other' }], [campaign], now)
    expect(decorated.campaignOffers).toEqual([{ id: 'beauty', name: 'Beauty', discountPercent: 20, minOrderAmount: 0 }])
    expect(other.campaignOffers).toEqual([])
    expect(decorated.price).toBe(100)
    expect(product).not.toHaveProperty('campaignOffers')
    const result = await evaluatePromoCampaigns([{ ...decorated, quantity: 1, bonusRate: 0, fromCatalog: true }], db([campaign]), now)
    expect(result.discount).toBe(20)
  })

  it('preserves the order threshold in offers and stops displaying expired campaigns', () => {
    const campaign = {
      id: 'beauty', type: 'discount', discountPercent: 20, active: true,
      startDate: '2026-09-01', endDate: '2026-09-18', targetBrands: ['BEAUTY IMAGE'], minOrderAmount: 200,
    } as PromoCampaign
    const product: Product = { id: 'wax', title: 'Wax', price: 100, category: 'body', brand: 'BEAUTY IMAGE', rating: 0, stock: 10 }
    expect(attachCampaignOffers([product], [campaign], new Date('2026-09-18T23:00:00'))[0].campaignOffers)
      .toEqual([{ id: 'beauty', discountPercent: 20, minOrderAmount: 200 }])
    expect(attachCampaignOffers([product], [campaign], new Date('2026-09-19T00:00:00'))[0].campaignOffers).toEqual([])
  })
  it('applies an active discount only to selected categories', async () => {
    const result = await evaluatePromoCampaigns([item('hair'), item('body', 200)], db([{
      id: 'summer', name: 'Лето', description: '', type: 'discount', discountPercent: 20,
      startDate: '2026-08-01', endDate: '2026-08-31', active: true,
      targetCategories: ['hair'], minOrderAmount: 0, createdAt: '', updatedAt: '',
    }]), new Date('2026-08-23T12:00:00Z'))
    expect(result).toMatchObject({ campaignId: 'summer', discount: 20, eligibleAmount: 100 })
  })

  it('ignores inactive, future and unsupported campaigns', async () => {
    const result = await evaluatePromoCampaigns([item('hair')], db([
      { id: 'off', name: 'Off', type: 'discount', discountPercent: 50, startDate: '2026-01-01', endDate: '', active: false, targetCategories: [], minOrderAmount: 0 },
      { id: 'future', name: 'Future', type: 'discount', discountPercent: 50, startDate: '2027-01-01', endDate: '', active: true, targetCategories: [], minOrderAmount: 0 },
      { id: 'gift', name: 'Gift', type: 'gift', discountPercent: 50, startDate: '2026-01-01', endDate: '', active: true, targetCategories: [], minOrderAmount: 0 },
    ]), new Date('2026-08-23T12:00:00Z'))
    expect(result).toEqual({ discount: 0, eligibleAmount: 0, freeShipping: false })
  })

  it('combines the best automatic discount with free shipping', async () => {
    const base = { description: '', startDate: '2026-01-01', endDate: '', active: true, targetCategories: [], minOrderAmount: 0, createdAt: '', updatedAt: '' }
    const result = await evaluatePromoCampaigns([item('hair', 100)], db([
      { ...base, id: 'sale', name: 'Sale', type: 'discount', discountPercent: 15 },
      { ...base, id: 'shipping', name: 'Shipping', type: 'free_shipping', discountPercent: 0 },
    ]), new Date('2026-08-23T12:00:00Z'))
    expect(result).toMatchObject({ discount: 15, freeShipping: true, campaignName: 'Sale' })
  })

  it('uses category, subcategory and brand filters with AND semantics', async () => {
    const result = await evaluatePromoCampaigns([
      { ...item('hair'), brand: 'Acme', subcategory: 'shampoo' },
      { ...item('hair', 200), brand: 'Other', subcategory: 'shampoo' },
      { ...item('hair', 300), brand: 'Acme', subcategory: 'mask' },
    ], db([{
      id: 'targeted', name: 'Targeted', description: '', type: 'discount', discountPercent: 10,
      startDate: '2026-01-01', endDate: '', active: true, targetCategories: ['hair'],
      targetSubcategories: ['shampoo'], targetBrands: ['ACME'], minOrderAmount: 0, createdAt: '', updatedAt: '',
    }]), new Date('2026-08-23T12:00:00Z'))
    expect(result).toMatchObject({ eligibleAmount: 100, discount: 10 })
  })
})

describe('campaign dates', () => {
  const dated = (startDate: string, endDate: string, active = true) => ({
    id: 'c', name: 'c', description: '', type: 'discount', discountPercent: 10, startDate, endDate, active,
    targetCategories: [], targetSubcategories: [], targetBrands: [], minOrderAmount: 0, createdAt: '', updatedAt: '',
  }) as PromoCampaign

  it('runs from local 00:00 of the start day to the end of the end day', () => {
    const campaign = dated('2026-11-01', '2026-11-30')
    expect(isCampaignActive(campaign, new Date(2026, 9, 31, 23, 59, 59))).toBe(false)
    expect(isCampaignActive(campaign, new Date(2026, 10, 1, 0, 0, 0))).toBe(true)
    expect(isCampaignActive(campaign, new Date(2026, 10, 30, 23, 59, 59))).toBe(true)
    expect(isCampaignActive(campaign, new Date(2026, 11, 1, 0, 0, 0))).toBe(false)
    expect(isCampaignActive(dated('2026-11-01', '2026-11-30', false), new Date(2026, 10, 5))).toBe(false)
  })

  it('keeps scheduled campaigns armed and leaves the pause switch to started ones', () => {
    const now = new Date(2026, 9, 30, 15, 0)
    expect(campaignActiveFlag('2026-11-01', false, now)).toBe(true)
    expect(campaignActiveFlag('2026-10-30', false, now)).toBe(false)
    expect(campaignActiveFlag('2026-10-30', undefined, now)).toBe(true)
    expect(campaignActiveFlag('2026-10-01', true, now)).toBe(true)
  })
})

describe('second_item_discount campaigns', () => {
  const now = new Date('2026-11-10T12:00:00Z')
  const second = (overrides: Partial<PromoCampaign> = {}): PromoCampaign => ({
    id: 'kemon-2nd', name: 'Kemon 2nd', description: '', type: 'second_item_discount', discountPercent: 50,
    startDate: '2026-11-01', endDate: '2026-11-30', active: true,
    targetCategories: [], targetSubcategories: [], targetBrands: ['Kemon'],
    minOrderAmount: 0, createdAt: '2026-10-01T00:00:00Z', updatedAt: '', ...overrides,
  })
  const unit = (id: string, price: number, quantity = 1, brand = 'Kemon') => ({ id, quantity, price, brand, bonusRate: 0, fromCatalog: true })

  it('discounts the cheaper unit of each pair and reports the per-line split', async () => {
    const result = await evaluatePromoCampaigns([unit('a', 10), unit('b', 8), unit('c', 6), unit('d', 4)], db([second()]), now)
    expect(result).toMatchObject({ campaignId: 'kemon-2nd', campaignName: 'Kemon 2nd', discount: 6, eligibleAmount: 28, freeShipping: false })
    expect(result.lineDiscounts).toEqual([
      { index: 1, campaignId: 'kemon-2nd', discountedUnits: 1, discount: 4 },
      { index: 3, campaignId: 'kemon-2nd', discountedUnits: 1, discount: 2 },
    ])
  })

  it('adds up campaigns for different brands', async () => {
    const result = await evaluatePromoCampaigns(
      [unit('a', 10, 2), unit('b', 20, 2, 'Other')],
      db([second(), second({ id: 'other-2nd', name: 'Other 2nd', targetBrands: ['Other'], discountPercent: 10, createdAt: '2026-10-02T00:00:00Z' })]),
      now,
    )
    expect(result).toMatchObject({ discount: 7, campaignName: 'Kemon 2nd, Other 2nd' })
    expect(result.lineDiscounts?.map((line) => line.campaignId)).toEqual(['kemon-2nd', 'other-2nd'])
  })

  it('competes with percentage campaigns as one discount; the larger wins and nothing stacks', async () => {
    const percent = (discountPercent: number): PromoCampaign => ({ ...second(), id: 'brand-sale', name: 'Brand sale', type: 'discount', discountPercent })
    const items = [unit('a', 10, 2)]
    const small = await evaluatePromoCampaigns(items, db([second(), percent(10)]), now)
    expect(small).toMatchObject({ campaignId: 'kemon-2nd', discount: 5 })
    const large = await evaluatePromoCampaigns(items, db([second(), percent(30)]), now)
    expect(large).toMatchObject({ campaignId: 'brand-sale', discount: 6 })
    expect(large.lineDiscounts).toBeUndefined()
  })

  it('keeps free shipping from a separate campaign', async () => {
    const shipping: PromoCampaign = { ...second(), id: 'ship', name: 'Ship', type: 'free_shipping', targetBrands: [], discountPercent: 0 }
    const result = await evaluatePromoCampaigns([unit('a', 10, 2)], db([shipping, second()]), now)
    expect(result).toMatchObject({ discount: 5, freeShipping: true, campaignId: 'kemon-2nd' })
  })

  it('honours the minimum order amount and Riga campaign dates', async () => {
    expect((await evaluatePromoCampaigns([unit('a', 10, 2)], db([second({ minOrderAmount: 21 })]), now)).discount).toBe(0)
    expect((await evaluatePromoCampaigns([unit('a', 10, 2)], db([second({ minOrderAmount: 20 })]), now)).discount).toBe(5)
    // 2026-11-01 00:30 in Riga is still 2026-10-31 in UTC.
    expect((await evaluatePromoCampaigns([unit('a', 10, 2)], db([second()]), new Date('2026-10-31T22:30:00Z'))).discount).toBe(5)
    expect((await evaluatePromoCampaigns([unit('a', 10, 2)], db([second()]), new Date('2026-10-31T21:30:00Z'))).discount).toBe(0)
  })

  it('shows a second-item badge only on eligible products and never changes their price', () => {
    const product = (id: string, brand: string, price = 10): Product => ({ id, title: id, price, category: 'hair', brand, rating: 0, stock: 1 })
    const [kemon, excluded, other] = attachCampaignOffers(
      [product('k', 'KEMON'), product('x', 'Kemon'), product('o', 'Other')],
      [second({ excludedProductIds: ['x'] })],
      now,
    )
    expect(kemon.secondItemOffers).toEqual([{ id: 'kemon-2nd', name: 'Kemon 2nd', discountPercent: 50, minOrderAmount: 0 }])
    expect(kemon.campaignOffers).toEqual([])
    expect(kemon.price).toBe(10)
    expect(excluded.secondItemOffers).toEqual([])
    expect(other.secondItemOffers).toEqual([])
  })

  it('leaves products untouched when no second-item campaign is active', () => {
    const product: Product = { id: 'k', title: 'k', price: 10, category: 'hair', brand: 'Kemon', rating: 0, stock: 1 }
    const [decorated] = attachCampaignOffers([product], [second({ active: false })], now)
    expect(decorated).not.toHaveProperty('secondItemOffers')
  })
})
