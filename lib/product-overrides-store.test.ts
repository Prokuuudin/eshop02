import { describe, expect, it, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    keyValueSetting: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

import { prisma } from '@/lib/prisma'
// Every name this test file will ever need across all 6 tasks is imported once,
// here, up front — later tasks add tests, not new import lines, to avoid
// duplicate-import churn on a single module specifier.
import {
  applyProductOverride,
  mergeProductsWithOverrides,
  getProductOverrides,
  getAdminProducts,
  upsertProductOverride,
  resetProductOverride,
  restoreDeletedProduct,
  type ProductOverride,
} from '@/lib/product-overrides-store'
import type { Product } from '@/data/products'

beforeEach(() => vi.clearAllMocks())

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    title: 'Base title',
    brand: 'Base brand',
    price: 100,
    description: 'Base description',
    rating: 4,
    category: 'hair',
    stock: 10,
    ...overrides,
  }
}

describe('applyProductOverride', () => {
  it('returns the base product unchanged when there is no override', () => {
    const base = makeProduct()
    expect(applyProductOverride(base, undefined)).toEqual(base)
  })

  it('lets an overridden field win over the base value while keeping other base fields', () => {
    const base = makeProduct({ price: 100, description: 'From ERP sync' })
    const override: ProductOverride = { price: 150 }
    const result = applyProductOverride(base, override)
    expect(result.price).toBe(150)
    expect(result.description).toBe('From ERP sync')
    expect(result.title).toBe(base.title)
  })

  it('regression: a sync-refreshed base price/description does not clobber an admin override', () => {
    // This is the exact collision found in the 2026-07-21 audit: upsert-products.ts
    // writes fresh price/description into the base Product row on every sync run.
    // The override layer must still show the admin's values afterwards.
    const freshBaseFromSync = makeProduct({ price: 999, description: 'Raw ERP HTML &amp; entities' })
    const adminOverride: ProductOverride = { price: 149.99, description: 'Curated local description' }
    const result = applyProductOverride(freshBaseFromSync, adminOverride)
    expect(result.price).toBe(149.99)
    expect(result.description).toBe('Curated local description')
  })
})

describe('mergeProductsWithOverrides', () => {
  it('applies each product\'s own override by id and leaves untouched products as-is', () => {
    const products = [makeProduct({ id: 'p1', price: 100 }), makeProduct({ id: 'p2', price: 200 })]
    const overrides: Record<string, ProductOverride> = { p1: { price: 111 } }
    const result = mergeProductsWithOverrides(products, overrides)
    expect(result.find((p) => p.id === 'p1')?.price).toBe(111)
    expect(result.find((p) => p.id === 'p2')?.price).toBe(200)
  })
})

describe('getProductOverrides', () => {
  it('returns {} when no override row exists yet', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    const result = await getProductOverrides()
    expect(result).toEqual({})
    expect(prisma.keyValueSetting.findUnique).toHaveBeenCalledWith({ where: { key: 'product-overrides' } })
  })

  it('returns the parsed map from the KeyValueSetting row', async () => {
    const stored = { p1: { price: 149.99 }, p2: { description: 'Local text' } }
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: stored,
      updatedAt: new Date(),
    } as never)
    const result = await getProductOverrides()
    expect(result).toEqual(stored)
  })

  it('defensively returns {} if the stored value is not an object', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: 'not-an-object' as never,
      updatedAt: new Date(),
    } as never)
    const result = await getProductOverrides()
    expect(result).toEqual({})
  })
})

describe('getAdminProducts', () => {
  it('merges stored overrides into the base rows it reads from Product', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: 'p1',
        title: 'Base title',
        titleKey: null, titleEn: null, titleLv: null,
        description: 'Base description', brand: 'Base brand',
        price: 100, oldPrice: null, rating: 4, ratingCount: 0, reviewCount: 0,
        image: null, images: [], metaTitle: null, metaDescription: null, ogImage: null, ogAlt: null,
        badges: [], category: 'hair', stock: 10, isActive: true, barcode: null,
        relatedProductIds: [], oftenBoughtTogether: [], minOrderQuantities: null, technicalSpecs: null,
        bulkPricingTiers: null, demoVideo: null, distributorName: null, distributorAddress: null,
        sku: null, unitOfMeasure: null, certificates: [], packagingSize: null, compatibleEquipment: [],
        manufacturerName: null, manufacturerAddress: null, manufacturerEmail: null, distributorEmail: null,
        bonusRate: null, feature1: null, feature1En: null, feature1Lv: null,
        feature2: null, feature2En: null, feature2Lv: null, feature3: null, feature3En: null, feature3Lv: null,
        feature4: null, feature4En: null, feature4Lv: null, specVolume: null, specType: null, specCountry: null,
        isCustom: false, isDeleted: false, externalId: 'ext-1', lastSyncRunId: null,
        createdAt: new Date(), updatedAt: new Date(),
      } as never,
    ])
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: { p1: { price: 149.99 } },
      updatedAt: new Date(),
    } as never)

    const result = await getAdminProducts()
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(149.99)
    expect(result[0].title).toBe('Base title')
  })

  it('degrades gracefully to base (un-overridden) product data when getProductOverrides() rejects', async () => {
    // Regression for the audit finding: getDbProducts/getDbProductsPaginated/getAdminProducts all run
    // Promise.all([prisma.product.findMany(...), getProductOverrides()]). Without a .catch() on the
    // getProductOverrides() call, a transient KeyValueSetting read failure rejects the whole Promise.all
    // and takes down the entire product listing (storefront, sitemap, categories, v1 API, admin panel)
    // even though the base Product rows loaded fine.
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      {
        id: 'p1',
        title: 'Base title',
        titleKey: null, titleEn: null, titleLv: null,
        description: 'Base description', brand: 'Base brand',
        price: 100, oldPrice: null, rating: 4, ratingCount: 0, reviewCount: 0,
        image: null, images: [], metaTitle: null, metaDescription: null, ogImage: null, ogAlt: null,
        badges: [], category: 'hair', stock: 10, isActive: true, barcode: null,
        relatedProductIds: [], oftenBoughtTogether: [], minOrderQuantities: null, technicalSpecs: null,
        bulkPricingTiers: null, demoVideo: null, distributorName: null, distributorAddress: null,
        sku: null, unitOfMeasure: null, certificates: [], packagingSize: null, compatibleEquipment: [],
        manufacturerName: null, manufacturerAddress: null, manufacturerEmail: null, distributorEmail: null,
        bonusRate: null, feature1: null, feature1En: null, feature1Lv: null,
        feature2: null, feature2En: null, feature2Lv: null, feature3: null, feature3En: null, feature3Lv: null,
        feature4: null, feature4En: null, feature4Lv: null, specVolume: null, specType: null, specCountry: null,
        isCustom: false, isDeleted: false, externalId: 'ext-1', lastSyncRunId: null,
        createdAt: new Date(), updatedAt: new Date(),
      } as never,
    ])
    vi.mocked(prisma.keyValueSetting.findUnique).mockRejectedValue(new Error('transient db error'))

    const result = await getAdminProducts()
    expect(result).toHaveLength(1)
    expect(result[0].price).toBe(100)
    expect(result[0].title).toBe('Base title')
  })
})
