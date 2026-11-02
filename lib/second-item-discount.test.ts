import { describe, expect, it } from 'vitest'
import {
  calculateSecondItemCampaigns,
  calculateSecondItemDiscount,
  findOverlappingSecondItemCampaign,
  isSecondItemCampaignActive,
  normalizeSecondItemSettings,
  rigaDay,
  type SecondItemLine,
} from './second-item-discount'

const campaign = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1', targetBrands: ['Kemon'], discountPercent: 50, ...overrides,
})
const line = (id: string, price: number, quantity = 1, overrides: Partial<SecondItemLine> = {}): SecondItemLine => ({
  id, price, quantity, brand: 'KEMON', fromCatalog: true, ...overrides,
})

describe('calculateSecondItemDiscount — pairing', () => {
  it('discounts 8 and 4 for prices 10/8/6/4', () => {
    const result = calculateSecondItemDiscount(campaign({ discountPercent: 100 }), [
      line('a', 6), line('b', 10), line('c', 4), line('d', 8),
    ])
    expect(result.discountCents).toBe(1200)
    expect(result.lines).toEqual([
      { index: 2, campaignId: 'c1', discountedUnits: 1, discountCents: 400 },
      { index: 3, campaignId: 'c1', discountedUnits: 1, discountCents: 800 },
    ])
  })

  it.each([
    [1, 0, 0],
    [2, 1, 500],
    [3, 1, 500],
    [4, 2, 1000],
    [5, 2, 1000],
  ])('identical units: quantity %i -> %i discounted units', (quantity, units, cents) => {
    const result = calculateSecondItemDiscount(campaign(), [line('a', 10, quantity)])
    expect(result.discountCents).toBe(cents)
    expect(result.lines.reduce((sum, item) => sum + item.discountedUnits, 0)).toBe(units)
  })

  it.each([
    // [quantities of a(20€), b(10€)] -> expected cents at 50%
    [[1, 1], 500], // (20,10)
    [[2, 1], 1000], // (20,20) 10 unpaired
    [[1, 2], 500], // (20,10) 10 unpaired
    [[2, 2], 1500], // (20,20) (10,10)
    [[3, 2], 1500], // (20,20) (20,10) 10 unpaired -> 20*0.5 + 10*0.5
  ])('mixed products %j', ([qa, qb], cents) => {
    expect(calculateSecondItemDiscount(campaign(), [line('a', 20, qa), line('b', 10, qb)]).discountCents).toBe(cents)
  })

  it('pairs variants of the same product as separate lines on equal terms', () => {
    const result = calculateSecondItemDiscount(campaign(), [line('p', 12, 1), line('p', 12, 1), line('p', 12, 1)])
    expect(result.discountCents).toBe(600)
    expect(result.lines).toEqual([{ index: 1, campaignId: 'c1', discountedUnits: 1, discountCents: 600 }])
  })

  it('ignores other brands, non-catalog lines and zero prices', () => {
    const result = calculateSecondItemDiscount(campaign(), [
      line('a', 10), line('b', 10, 1, { brand: 'Other' }), line('c', 0), line('d', 10, 1, { fromCatalog: false }),
    ])
    expect(result.discountCents).toBe(0)
    expect(calculateSecondItemDiscount(campaign(), [line('a', 0, 2)]).discountCents).toBe(0)
  })

  it('matches the brand case- and whitespace-insensitively', () => {
    expect(calculateSecondItemDiscount(campaign({ targetBrands: ['  kemon '] }), [line('a', 10, 2)]).discountCents).toBe(500)
  })

  it('limits the pairs to maxPairs, keeping the most expensive pairs', () => {
    const lines = [line('a', 10), line('b', 8), line('c', 6), line('d', 4)]
    expect(calculateSecondItemDiscount(campaign({ maxPairs: 1, discountPercent: 100 }), lines).discountCents).toBe(800)
    expect(calculateSecondItemDiscount(campaign({ maxPairs: 5, discountPercent: 100 }), lines).discountCents).toBe(1200)
  })

  it('restricts to selected products and removes excluded ones', () => {
    const lines = [line('a', 10), line('b', 8), line('c', 6)]
    expect(calculateSecondItemDiscount(campaign({ productIds: ['a', 'c'], discountPercent: 100 }), lines).discountCents).toBe(600)
    expect(calculateSecondItemDiscount(campaign({ excludedProductIds: ['b'], discountPercent: 100 }), lines).discountCents).toBe(600)
  })

  it('excludes products on sale only when configured', () => {
    const lines = [line('a', 10), line('b', 8, 1, { oldPrice: 12 })]
    expect(calculateSecondItemDiscount(campaign({ discountPercent: 100 }), lines).discountCents).toBe(800)
    expect(calculateSecondItemDiscount(campaign({ discountPercent: 100, excludeSaleItems: true }), lines).discountCents).toBe(0)
  })

  it('uses the post-bulk-tier unit price and rounds each line half up in cents', () => {
    // 3.33 * 15% = 0.4995 -> 0.50; 2 discounted units of 0.99 * 15% = 0.297 -> 0.30
    expect(calculateSecondItemDiscount(campaign({ discountPercent: 15 }), [line('a', 3.33, 2)]).discountCents).toBe(50)
    expect(calculateSecondItemDiscount(campaign({ discountPercent: 15 }), [line('a', 0.99, 4)]).discountCents).toBe(30)
    // 0.1 + 0.2 style float inputs still land on exact cents
    expect(calculateSecondItemDiscount(campaign({ discountPercent: 100 }), [line('a', 0.30000000000000004, 2)]).discountCents).toBe(30)
  })

  it('gives the cheaper unit for free at 100%', () => {
    expect(calculateSecondItemDiscount(campaign({ discountPercent: 100 }), [line('a', 25.5), line('b', 19.99)]).discountCents).toBe(1999)
  })

  it('applies nothing for an invalid percent', () => {
    for (const discountPercent of [0, 101, 12.5, Number.NaN]) {
      expect(calculateSecondItemDiscount(campaign({ discountPercent }), [line('a', 10, 2)]).discountCents).toBe(0)
    }
  })

  it('handles large quantities without expanding units', () => {
    expect(calculateSecondItemDiscount(campaign(), [line('a', 1, 100001)]).discountCents).toBe(2500000)
  })
})

describe('calculateSecondItemCampaigns', () => {
  it('adds up campaigns of different brands', () => {
    const result = calculateSecondItemCampaigns(
      [campaign(), campaign({ id: 'c2', targetBrands: ['Other'], discountPercent: 100 })],
      [line('a', 10, 2), line('b', 4, 2, { brand: 'Other' })],
    )
    expect(result.discountCents).toBe(500 + 400)
    expect(result.campaignIds).toEqual(['c1', 'c2'])
  })

  it('never discounts the same line twice', () => {
    const result = calculateSecondItemCampaigns([campaign(), campaign({ id: 'c2', discountPercent: 100 })], [line('a', 10, 2)])
    expect(result.discountCents).toBe(500)
    expect(result.lines).toHaveLength(1)
  })
})

describe('campaign dates in Europe/Riga', () => {
  const dated = { active: true, startDate: '2026-11-03', endDate: '2026-11-05' }

  it('reads the calendar day in Riga, not UTC', () => {
    expect(rigaDay(new Date('2026-11-02T22:30:00Z'))).toBe('2026-11-03') // 00:30 Riga (EET, UTC+2)
    expect(rigaDay(new Date('2026-07-01T21:30:00Z'))).toBe('2026-07-02') // 00:30 Riga (EEST, UTC+3)
  })

  it('starts at 00:00 Riga on the start day and ends after 23:59 Riga on the end day', () => {
    expect(isSecondItemCampaignActive(dated, new Date('2026-11-02T21:59:59Z'))).toBe(false)
    expect(isSecondItemCampaignActive(dated, new Date('2026-11-02T22:00:00Z'))).toBe(true)
    expect(isSecondItemCampaignActive(dated, new Date('2026-11-05T21:59:59Z'))).toBe(true)
    expect(isSecondItemCampaignActive(dated, new Date('2026-11-05T22:00:00Z'))).toBe(false)
  })

  it('treats an empty end date as open-ended and respects the active flag', () => {
    expect(isSecondItemCampaignActive({ ...dated, endDate: '' }, new Date('2030-01-01T12:00:00Z'))).toBe(true)
    expect(isSecondItemCampaignActive({ ...dated, active: false }, new Date('2026-11-04T12:00:00Z'))).toBe(false)
  })
})

describe('normalizeSecondItemSettings', () => {
  it('accepts a valid configuration', () => {
    expect(normalizeSecondItemSettings({
      targetBrands: [' Kemon '], discountPercent: 30, productIds: ['a', 'a', ''], excludedProductIds: ['b'],
      excludeSaleItems: true, maxPairs: 2,
    })).toEqual({ ok: true, value: {
      targetBrands: ['Kemon'], discountPercent: 30, productIds: ['a'], excludedProductIds: ['b'], excludeSaleItems: true, maxPairs: 2,
    } })
    expect(normalizeSecondItemSettings({ targetBrands: ['Kemon'], discountPercent: 100, maxPairs: '' })).toMatchObject({ ok: true, value: { maxPairs: null } })
  })

  it.each([
    [{ targetBrands: [], discountPercent: 10 }, 'brand_required'],
    [{ targetBrands: ['A', 'B'], discountPercent: 10 }, 'brand_required'],
    [{ targetBrands: ['A'], discountPercent: 0 }, 'invalid_discount_percent'],
    [{ targetBrands: ['A'], discountPercent: 101 }, 'invalid_discount_percent'],
    [{ targetBrands: ['A'], discountPercent: 10.5 }, 'invalid_discount_percent'],
    [{ targetBrands: ['A'], discountPercent: 10, maxPairs: -1 }, 'invalid_max_pairs'],
    [{ targetBrands: ['A'], discountPercent: 10, maxPairs: 1.5 }, 'invalid_max_pairs'],
  ])('rejects %j', (input, error) => {
    expect(normalizeSecondItemSettings(input)).toEqual({ ok: false, error })
  })
})

describe('findOverlappingSecondItemCampaign', () => {
  const existing = [
    { id: 'x', type: 'second_item_discount', startDate: '2026-11-01', endDate: '2026-11-10', targetBrands: ['Kemon'] },
    { id: 'y', type: 'discount', startDate: '2026-11-01', endDate: '', targetBrands: ['Kemon'] },
  ]

  it('finds a same-brand campaign with intersecting dates', () => {
    expect(findOverlappingSecondItemCampaign(existing, { startDate: '2026-11-10', endDate: '2026-11-20', targetBrands: [' kemon'] })?.id).toBe('x')
    expect(findOverlappingSecondItemCampaign(existing, { startDate: '2026-10-01', endDate: '', targetBrands: ['Kemon'] })?.id).toBe('x')
  })

  it('allows other brands, disjoint dates, other types and the campaign itself', () => {
    expect(findOverlappingSecondItemCampaign(existing, { startDate: '2026-11-11', endDate: '', targetBrands: ['Kemon'] })).toBeUndefined()
    expect(findOverlappingSecondItemCampaign(existing, { startDate: '2026-11-01', endDate: '', targetBrands: ['Other'] })).toBeUndefined()
    expect(findOverlappingSecondItemCampaign(existing, { id: 'x', startDate: '2026-11-01', endDate: '', targetBrands: ['Kemon'] })).toBeUndefined()
  })
})
