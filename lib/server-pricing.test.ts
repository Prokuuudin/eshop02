import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: vi.fn() },
    promoCode: { findFirst: vi.fn() },
  },
}))

import {
  resolveLineItems,
  getServerPromoDiscountPct,
  recomputeOrderPricing,
} from './server-pricing'
import { prisma } from '@/lib/prisma'

beforeEach(() => vi.clearAllMocks())

describe('resolveLineItems', () => {
  it('uses catalog price and ignores client-supplied price', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    const items = await resolveLineItems([{ id: 'p1', quantity: 2, price: 1 }])
    expect(items[0].price).toBe(1000)
    expect(items[0].fromCatalog).toBe(true)
  })

  it('applies bulk tier pricing by quantity', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: [{ quantity: 10, pricePerUnit: 800 }] },
    ])
    const cheap = await resolveLineItems([{ id: 'p1', quantity: 5 }])
    expect(cheap[0].price).toBe(1000)
    const bulk = await resolveLineItems([{ id: 'p1', quantity: 12 }])
    expect(bulk[0].price).toBe(800)
  })

  it('falls back to sanitized client price when product missing from catalog', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([])
    const items = await resolveLineItems([{ id: 'ghost', quantity: 1, price: 500 }])
    expect(items[0].price).toBe(500)
    expect(items[0].fromCatalog).toBe(false)
  })

  it('clamps negative client fallback price to 0', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([])
    const items = await resolveLineItems([{ id: 'ghost', quantity: 1, price: -999 }])
    expect(items[0].price).toBe(0)
  })
})

describe('getServerPromoDiscountPct', () => {
  it('returns 0 for empty code', async () => {
    expect(await getServerPromoDiscountPct('', 1000)).toBe(0)
  })

  it('returns 0 when minOrder not met', async () => {
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue({
      code: 'SPRING20', discount: 20, minOrder: 2000, maxUses: null, usedCount: 0, expiresAt: null,
    })
    expect(await getServerPromoDiscountPct('SPRING20', 1500)).toBe(0)
  })

  it('returns discount when valid', async () => {
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue({
      code: 'WELCOME10', discount: 10, minOrder: 0, maxUses: null, usedCount: 0, expiresAt: null,
    })
    expect(await getServerPromoDiscountPct('welcome10', 1000)).toBe(10)
  })

  it('returns 0 when maxUses exhausted', async () => {
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue({
      code: 'X', discount: 50, minOrder: 0, maxUses: 5, usedCount: 5, expiresAt: null,
    })
    expect(await getServerPromoDiscountPct('X', 1000)).toBe(0)
  })
})

describe('recomputeOrderPricing', () => {
  it('recomputes totals from catalog and ignores tampered prices', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 2, price: 1 }], // attacker tries price=1
      deliveryMethod: 'courier',
      userBonusBalance: null,
    })

    expect(r.subtotal).toBe(2000) // 1000 * 2, not 2
    expect(r.delivery).toBe(500)
    expect(r.tax).toBe(360) // round(2000 * 0.18)
    expect(r.total).toBe(2000 + 360 + 500)
  })

  it('forbids bonus spend for guests (no balance)', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      bonusSpent: 9999,
      userBonusBalance: null,
    })
    expect(r.bonusSpent).toBe(0)
  })

  it('caps bonus spend at the real user balance', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue(null)

    const r = await recomputeOrderPricing({
      items: [{ id: 'p1', quantity: 1 }],
      bonusSpent: 9999,
      userBonusBalance: 300,
    })
    expect(r.bonusSpent).toBe(300)
    expect(r.total).toBe(1000 + 180 + 500 - 300)
  })

  it('applies a valid promo discount', async () => {
    vi.mocked(prisma.product.findMany as any).mockResolvedValue([
      { id: 'p1', price: 1000, bulkPricingTiers: null },
    ])
    vi.mocked(prisma.promoCode.findFirst as any).mockResolvedValue({
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
    expect(r.tax).toBe(162) // round((1000-100)*0.18)
    expect(r.total).toBe(900 + 162)
  })
})
