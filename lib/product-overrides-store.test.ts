import { describe, expect, it, vi } from 'vitest'

// mapDbToProduct is a pure mapping function, but the module also imports lib/prisma,
// which throws at import time if DATABASE_URL is unset. Mock it so this test doesn't
// require a real DB connection (same pattern as lib/catalog-service.test.ts).
vi.mock('@/lib/prisma', () => ({
  prisma: {}
}))

// react's cache() is a server-component-only export that isn't available under
// vitest's plain node environment. Stub it as identity so module-level
// `cache(async () => ...)` calls in product-overrides-store.ts don't throw on import.
vi.mock('react', () => ({
  cache: <T>(fn: T): T => fn
}))

import { mapDbToProduct } from './product-overrides-store'
import type { Product as PrismaProduct } from '@/generated/prisma/client'

function makeDbProduct(overrides: Partial<PrismaProduct> = {}): PrismaProduct {
  return {
    id: 'p1', title: 'Test', titleKey: null, titleEn: null, titleLv: null,
    description: null, brand: 'Brand', price: 10, oldPrice: null,
    rating: 0, ratingCount: 0, reviewCount: 0, image: null, images: [],
    metaTitle: null, metaDescription: null, ogImage: null, ogAlt: null,
    badges: [], category: 'hair', stock: 5, barcode: null,
    purpose: null, purposeEn: null, purposeLv: null,
    relatedProductIds: [], oftenBoughtTogether: [], minOrderQuantities: null,
    technicalSpecs: null, variantGroups: null, bulkPricingTiers: null, demoVideo: null,
    distributorName: null, distributorAddress: null, sku: null, unitOfMeasure: null,
    certificates: [], packagingSize: null, compatibleEquipment: [],
    manufacturerName: null, manufacturerAddress: null, manufacturerEmail: null,
    distributorEmail: null, bonusRate: null,
    feature1: null, feature1En: null, feature1Lv: null,
    feature2: null, feature2En: null, feature2Lv: null,
    feature3: null, feature3En: null, feature3Lv: null,
    feature4: null, feature4En: null, feature4Lv: null,
    specVolume: null, specType: null, specCountry: null,
    isCustom: false, isDeleted: false,
    createdAt: new Date(), updatedAt: new Date(),
    externalId: null, isActive: true, lastSyncRunId: null,
    ...overrides,
  } as PrismaProduct
}

describe('mapDbToProduct — variantGroups', () => {
  it('maps null to undefined', () => {
    const product = mapDbToProduct(makeDbProduct({ variantGroups: null }))
    expect(product.variantGroups).toBeUndefined()
  })

  it('passes through a populated variantGroups array', () => {
    const groups = [{ name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }] }]
    const product = mapDbToProduct(makeDbProduct({ variantGroups: groups as unknown as PrismaProduct['variantGroups'] }))
    expect(product.variantGroups).toEqual(groups)
  })
})
