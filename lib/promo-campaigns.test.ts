import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { attachCampaignOffers, evaluatePromoCampaigns, type PromoCampaign } from './promo-campaigns'
import type { Product } from '@/data/products'

const item = (category: string, price = 100) => ({
  id: `${category}-${price}`, quantity: 1, price, category,
  bonusRate: 0, fromCatalog: true,
})

function db(value: unknown) {
  return { keyValueSetting: { findUnique: vi.fn().mockResolvedValue({ value }) } } as never
}

describe('evaluatePromoCampaigns', () => {
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
