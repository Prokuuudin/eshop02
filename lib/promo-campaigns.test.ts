import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { evaluatePromoCampaigns } from './promo-campaigns'

const item = (category: string, price = 100) => ({
  id: `${category}-${price}`, quantity: 1, price, category,
  bonusRate: 0, fromCatalog: true,
})

function db(value: unknown) {
  return { keyValueSetting: { findUnique: vi.fn().mockResolvedValue({ value }) } } as never
}

describe('evaluatePromoCampaigns', () => {
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
