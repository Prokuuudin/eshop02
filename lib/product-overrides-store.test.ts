import { describe, expect, it, vi, beforeEach } from 'vitest'
vi.mock('server-only', () => ({}))

const settingFindUniqueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => {
  const client = {
    product: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    keyValueSetting: {
      findUnique: settingFindUniqueMock,
      upsert: vi.fn(),
    },
    $executeRaw: vi.fn(),
    // Tests don't exercise real transactional isolation - the callback just
    // gets the same mocked client, so `tx.foo` and `prisma.foo` hit the same
    // mock either way.
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(client)),
  }
  return { prisma: client }
})

import { prisma } from '@/lib/prisma'
// Every name this test file will ever need across all 6 tasks is imported once,
// here, up front — later tasks add tests, not new import lines, to avoid
// duplicate-import churn on a single module specifier.
import {
  applyProductOverride,
  mergeProductsWithOverrides,
  getProductOverrides,
  getAdminProducts,
  getAdminProductById,
  getDuplicateProductMetadataFlags,
  getAdminProductsPaginated,
  getDbProductsPaginated,
  getMergedProductById,
  getMergedProductsWithPrices,
  getMergedProductsByIds,
  getRelatedStorefrontProducts,
  getPublicProductSitemapRows,
  getPublicProductCategories,
  getStorefrontFacetProducts,
  upsertProductOverride,
  resetProductOverride,
  restoreDeletedProduct,
  deleteProductAny,
  purgeDeletedProductArchive,
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

describe('getAdminProductsPaginated', () => {
  it('applies the page bounds and searches the indexed product fields in the database', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    vi.mocked(prisma.product.count).mockResolvedValue(73)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)

    const result = await getAdminProductsPaginated({ search: 'shampoo', skip: 24, take: 24 })

    expect(result).toEqual({ products: [], total: 73 })
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 24,
      take: 24,
      orderBy: { createdAt: 'desc' },
      where: expect.objectContaining({
        isDeleted: false,
        OR: expect.arrayContaining([
          { title: { contains: 'shampoo', mode: 'insensitive' } },
          { sku: { contains: 'shampoo', mode: 'insensitive' } },
        ]),
      }),
    }))
  })
})

describe('upsertProductOverride', () => {
  const baseDbProduct = {
    id: 'p1', isDeleted: false, externalId: null as string | null,
  }

  it('returns an error when the product does not exist', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const result = await upsertProductOverride('missing', { price: 10 })
    expect(result.success).toBe(false)
  })

  it('writes the patch into the override map instead of updating the Product row', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(baseDbProduct as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await upsertProductOverride('p1', { price: 149.99, description: 'Local text' })

    expect(result.success).toBe(true)
    expect(prisma.product.update).not.toHaveBeenCalled()
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { key: 'product-overrides' },
        update: { value: { p1: { price: 149.99, description: 'Local text' } } },
      })
    )
  })

  it('merges into any existing overrides for the same product without dropping other fields', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(baseDbProduct as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: { p1: { description: 'Already overridden description' } },
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    await upsertProductOverride('p1', { price: 149.99 })

    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {
          value: { p1: { description: 'Already overridden description', price: 149.99 } },
        },
      })
    )
  })

  it('rejects a stock change on a synced product (externalId set)', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...baseDbProduct, externalId: 'ext-1' } as never)

    const result = await upsertProductOverride('p1', { stock: 5 })

    expect(result.success).toBe(false)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('allows a stock change on a manually created product (externalId null)', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...baseDbProduct, externalId: null } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await upsertProductOverride('p1', { stock: 5 })

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalled()
  })
})

describe('upsertProductOverride — diffing against the current merged value', () => {
  const syncedDbProduct = { id: 'p1', isDeleted: false, externalId: 'ext-1' }

  it('does not reject or store stock when the form resubmits the same stock value it was shown', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...syncedDbProduct, stock: 25 } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    // Full-form-style patch: stock is present, but unchanged from the live value (25).
    const result = await upsertProductOverride('p1', { stock: 25, price: 149.99 })

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: { p1: { price: 149.99 } } } })
    )
  })

  it('still rejects when stock is genuinely different from the live value on a synced product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...syncedDbProduct, stock: 25 } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)

    const result = await upsertProductOverride('p1', { stock: 5 })

    expect(result.success).toBe(false)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('does not freeze unrelated fields that the form resubmitted unchanged', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      ...syncedDbProduct, stock: 25, title: 'Base title', brand: 'Base brand',
    } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    // Simulates a full-form save where only price actually changed.
    const result = await upsertProductOverride('p1', {
      title: 'Base title', brand: 'Base brand', stock: 25, price: 149.99,
    })

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: { p1: { price: 149.99 } } } })
    )
  })

  it('re-affirming an already-overridden field with the same value is a harmless no-op write', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ ...syncedDbProduct, stock: 25 } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: { p1: { price: 149.99 } },
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await upsertProductOverride('p1', { price: 149.99 })

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })
})

describe('resetProductOverride', () => {
  it('returns an error when the product does not exist', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const result = await resetProductOverride('missing')
    expect(result.success).toBe(false)
  })

  it('removes the product\'s override entry and persists the rest of the map', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: 'p1', isDeleted: false } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      key: 'product-overrides',
      value: { p1: { price: 149.99 }, p2: { description: 'Keep me' } },
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await resetProductOverride('p1')

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ update: { value: { p2: { description: 'Keep me' } } } })
    )
  })

  it('is a safe no-op when the product has no existing override', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: 'p1', isDeleted: false } as never)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await resetProductOverride('p1')

    expect(result.success).toBe(true)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })
})

describe('restoreDeletedProduct', () => {
  it('restores a synced product without reintroducing stock as an override', async () => {
    const archivedProduct = {
      id: 'p1', title: 'Base title', brand: 'Base brand', price: 139.99,
      rating: 4, category: 'hair' as const, stock: 3,
    }

    settingFindUniqueMock.mockImplementation(async (args: unknown) => {
      const key = (args as { where: { key: string } }).where.key
      if (key === 'deleted-products-archive') {
        return {
          key,
          value: [{ id: 'p1', product: archivedProduct, source: 'base', deletedAt: new Date().toISOString() }],
          updatedAt: new Date(),
        }
      }
      return null // 'product-overrides' key: no pre-existing overrides
    })

    vi.mocked(prisma.product.update).mockResolvedValue({} as never)
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'p1', isDeleted: false, externalId: 'ext-1',
      title: 'Base title', brand: 'Base brand', price: 149.99, // live price has moved on since archiving
      rating: 4, category: 'hair', stock: 25, // live stock has moved on since archiving
      titleKey: null, titleEn: null, titleLv: null, description: null, oldPrice: null,
      ratingCount: 0, reviewCount: 0, image: null, images: [], metaTitle: null, metaDescription: null,
      ogImage: null, ogAlt: null, badges: [], isActive: true, barcode: null, relatedProductIds: [],
      oftenBoughtTogether: [], minOrderQuantities: null, technicalSpecs: null, bulkPricingTiers: null,
      demoVideo: null, distributorName: null, distributorAddress: null, sku: null, unitOfMeasure: null,
      certificates: [], packagingSize: null, compatibleEquipment: [], manufacturerName: null,
      manufacturerAddress: null, manufacturerEmail: null, distributorEmail: null, bonusRate: null,
      feature1: null, feature1En: null, feature1Lv: null, feature2: null, feature2En: null, feature2Lv: null,
      feature3: null, feature3En: null, feature3Lv: null, feature4: null, feature4En: null, feature4Lv: null,
      specVolume: null, specType: null, specCountry: null, isCustom: false, lastSyncRunId: null,
      createdAt: new Date(), updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.keyValueSetting.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await restoreDeletedProduct('p1')

    expect(result.success).toBe(true)

    // buildOverrideFromSnapshot sees both price (139.99 vs 149.99) and stock (3 vs 25)
    // differ, so the override write must have happened — find it and check its contents.
    const upsertCalls = vi.mocked(prisma.keyValueSetting.upsert).mock.calls
    const overridesWrite = upsertCalls.find((c) => (c[0] as { where: { key: string } }).where.key === 'product-overrides')
    expect(overridesWrite).toBeDefined()

    const written = (overridesWrite![0] as { update: { value: Record<string, ProductOverride> } }).update.value
    expect(written.p1?.price).toBe(139.99)
    expect(written.p1?.stock).toBeUndefined()
  })
})

describe('deleteProductAny', () => {
  it('returns an error when the product does not exist', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const result = await deleteProductAny('missing')
    expect(result.success).toBe(false)
  })

  it('archives a synced product and marks it isDeleted inside one locked transaction', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'p1', isDeleted: false, isCustom: false,
      title: 'Base title', brand: 'Base brand', price: 100, rating: 4, category: 'hair', stock: 10,
    } as never)
    settingFindUniqueMock.mockResolvedValue(null) // no pre-existing archive
    vi.mocked(prisma.keyValueSetting.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.product.update).mockResolvedValue({} as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await deleteProductAny('p1')

    expect(result.success).toBe(true)
    // The archive-row read/write and the isDeleted flip must happen inside
    // the same $transaction call, guarded by the advisory lock - not as
    // separate top-level calls a concurrent request could interleave with.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    expect(prisma.product.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { isDeleted: true } })

    const archiveWrite = vi.mocked(prisma.keyValueSetting.upsert).mock.calls
      .find((c) => (c[0] as { where: { key: string } }).where.key === 'deleted-products-archive')
    expect(archiveWrite).toBeDefined()
    const archived = (archiveWrite![0] as unknown as { update: { value: Array<{ id: string }> } }).update.value
    expect(archived[0]?.id).toBe('p1')
  })

  it('hard-deletes a custom product instead of soft-deleting it', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue({
      id: 'custom-1', isDeleted: false, isCustom: true,
      title: 'Custom', brand: 'Brand', price: 10, rating: 0, category: 'hair', stock: 1,
    } as never)
    settingFindUniqueMock.mockResolvedValue(null)
    vi.mocked(prisma.keyValueSetting.upsert).mockResolvedValue({} as never)
    vi.mocked(prisma.product.delete).mockResolvedValue({} as never)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    const result = await deleteProductAny('custom-1')

    expect(result.success).toBe(true)
    expect(prisma.product.delete).toHaveBeenCalledWith({ where: { id: 'custom-1' } })
    expect(prisma.product.update).not.toHaveBeenCalled()
  })
})

describe('purgeDeletedProductArchive', () => {
  it('returns an error when the id is not in the archive', async () => {
    settingFindUniqueMock.mockResolvedValue({ key: 'deleted-products-archive', value: [], updatedAt: new Date() } as never)
    const result = await purgeDeletedProductArchive('missing')
    expect(result.success).toBe(false)
  })

  it('removes only the target entry from the archive', async () => {
    settingFindUniqueMock.mockResolvedValue({
      key: 'deleted-products-archive',
      value: [
        { id: 'p1', product: { id: 'p1' }, source: 'base', deletedAt: '2026-01-01T00:00:00.000Z' },
        { id: 'p2', product: { id: 'p2' }, source: 'base', deletedAt: '2026-01-01T00:00:00.000Z' },
      ],
      updatedAt: new Date(),
    } as never)
    vi.mocked(prisma.keyValueSetting.upsert).mockResolvedValue({} as never)

    const result = await purgeDeletedProductArchive('p1')

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.archive.map((e) => e.id)).toEqual(['p2'])
    }
  })
})

describe('getDbProductsPaginated', () => {
  beforeEach(() => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    vi.mocked(prisma.product.count).mockResolvedValue(0)
    settingFindUniqueMock.mockResolvedValue(null)
  })

  it('filters by id:{in:...} when ids are given, e.g. for batch wishlist lookups', async () => {
    await getDbProductsPaginated({ ids: ['p1', 'p2'] })
    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: ['p1', 'p2'] } }),
      })
    )
  })

  it('omits the id filter for a normal paginated request', async () => {
    await getDbProductsPaginated({ skip: 0, take: 10 })
    const call = vi.mocked(prisma.product.findMany).mock.calls[0][0] as { where: Record<string, unknown> }
    expect(call.where).not.toHaveProperty('id')
  })

  it('uses DB-level bounds and the explicit storefront projection', async () => {
    await getDbProductsPaginated({ skip: 96, take: 24, search: 'mask' })
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      skip: 96,
      take: 24,
      select: expect.objectContaining({ id: true, title: true, technicalSpecs: true }),
    }))
    expect(prisma.product.count).toHaveBeenCalledOnce()
  })

  it('preserves filter-affecting overrides via a narrow index scan plus a bounded page fetch', async () => {
    const indexRow = {
      id: 'p2', title: 'Product', titleEn: null, titleLv: null, description: null,
      brand: 'Brand', sku: null, price: 10, category: 'body', stock: 1,
      createdAt: new Date(), externalId: null, erpPriceMissing: false,
      manualPriceApproved: false, manualApprovedPrice: null,
    }
    vi.mocked(prisma.product.findMany)
      .mockResolvedValueOnce([indexRow] as never)
      .mockResolvedValueOnce([indexRow] as never)
    settingFindUniqueMock.mockResolvedValue({ value: { p2: { category: 'hair' } } } as never)

    const result = await getDbProductsPaginated({ category: 'hair', skip: 0, take: 24 })

    expect(result.total).toBe(1)
    expect(result.products[0]).toMatchObject({ id: 'p2', category: 'hair' })
    expect(prisma.product.count).not.toHaveBeenCalled()
    const firstQuery = vi.mocked(prisma.product.findMany).mock.calls[0][0] as { select: Record<string, boolean> }
    expect(firstQuery.select).toMatchObject({ id: true, category: true, description: true })
    expect(firstQuery.select).not.toHaveProperty('technicalSpecs')
    expect(vi.mocked(prisma.product.findMany).mock.calls[1][0]).toEqual(expect.objectContaining({
      where: { id: { in: ['p2'] }, isDeleted: false, isActive: true },
    }))
  })
})

describe('bounded admin product reads', () => {
  it('loads one admin product by id and applies its override', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue({
      id: 'p1', title: 'Base', brand: 'Brand', price: 10, rating: 0, category: 'hair', stock: 1,
      externalId: null, erpPriceMissing: false, manualPriceApproved: false, manualApprovedPrice: null,
      images: [], badges: [], relatedProductIds: [], oftenBoughtTogether: [], certificates: [],
      compatibleEquipment: [], createdAt: new Date(), updatedAt: new Date(), revision: 1, isActive: true,
    } as never)
    settingFindUniqueMock.mockResolvedValue({ value: { p1: { title: 'Override' } } } as never)

    const product = await getAdminProductById('p1')

    expect(product?.title).toBe('Override')
    expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'p1', isDeleted: false },
    }))
    expect(prisma.product.findMany).not.toHaveBeenCalled()
  })

  it('checks SEO duplicates with only id/meta columns', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: 'p2', metaTitle: ' Same title ', metaDescription: 'Other' },
    ] as never)
    await expect(getDuplicateProductMetadataFlags('p1', 'same TITLE', 'Unique')).resolves.toEqual({
      duplicateMetaTitle: true,
      duplicateMetaDescription: false,
    })
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, id: { not: 'p1' } },
      select: { id: true, metaTitle: true, metaDescription: true },
    })
  })
})

describe('bounded public product reads', () => {
  const detailRow = {
    id: '19073', title: 'Detail', titleKey: null, titleEn: null, titleLv: null,
    description: null, brand: 'Brand', price: 10, oldPrice: null, rating: 0,
    ratingCount: 0, reviewCount: 0, image: null, images: [], metaTitle: null,
    metaDescription: null, ogImage: null, ogAlt: null, badges: [], category: 'hair',
    stock: 1, createdAt: new Date(), updatedAt: new Date(), revision: 1, isActive: true,
    externalId: null, erpPriceMissing: false, manualPriceApproved: false,
    manualApprovedPrice: null, barcode: null, relatedProductIds: [], oftenBoughtTogether: [],
    minOrderQuantities: null, technicalSpecs: null, bulkPricingTiers: null, demoVideo: null,
    distributorName: null, distributorAddress: null, sku: null, unitOfMeasure: null,
    certificates: [], packagingSize: null, compatibleEquipment: [], manufacturerName: null,
    manufacturerAddress: null, manufacturerEmail: null, distributorEmail: null, bonusRate: null,
    feature1: null, feature1En: null, feature1Lv: null, feature2: null, feature2En: null,
    feature2Lv: null, feature3: null, feature3En: null, feature3Lv: null, feature4: null,
    feature4En: null, feature4Lv: null, specVolume: null, specType: null, specCountry: null,
  }

  it.each(['19073', '17228', '20561', '21360', '22272'])(
    'loads regression product %s with one-row predicates and no catalog read', async (id) => {
      vi.mocked(prisma.product.findFirst).mockResolvedValue({ ...detailRow, id } as never)
      settingFindUniqueMock.mockResolvedValue(null)

      const product = await getMergedProductById(id)

      expect(product?.id).toBe(id)
      expect(prisma.product.findFirst).toHaveBeenCalledWith(expect.objectContaining({
        where: { id, isDeleted: false, isActive: true },
        select: expect.objectContaining({ id: true, title: true, price: true }),
      }))
      expect(prisma.product.findMany).not.toHaveBeenCalled()
    },
  )

  it('returns null for a missing product without falling back to findMany', async () => {
    vi.mocked(prisma.product.findFirst).mockResolvedValue(null)
    expect(await getMergedProductById('missing')).toBeNull()
    expect(prisma.product.findMany).not.toHaveBeenCalled()
  })

  it('uses a bounded card projection for id batches', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    settingFindUniqueMock.mockResolvedValue(null)
    await getMergedProductsByIds(['p1', 'p2'])
    const query = vi.mocked(prisma.product.findMany).mock.calls[0][0] as {
      where: unknown
      select: Record<string, boolean>
    }
    expect(query.where).toEqual({ id: { in: ['p1', 'p2'] }, isDeleted: false, isActive: true })
    expect(query.select).toMatchObject({
      id: true, title: true, image: true, minOrderQuantities: true,
      technicalSpecs: true, bulkPricingTiers: true,
    })
    expect(query.select).not.toHaveProperty('description')
    expect(query.select).not.toHaveProperty('images')
  })

  it('bounds every fallback recommendation query', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    settingFindUniqueMock.mockResolvedValue(null)
    await getRelatedStorefrontProducts({
      id: 'p1', title: 'Product', brand: 'Brand', price: 10, rating: 0, category: 'hair', stock: 1,
    })
    expect(prisma.product.findMany).toHaveBeenCalledTimes(3)
    for (const [query] of vi.mocked(prisma.product.findMany).mock.calls) {
      expect(query).toEqual(expect.objectContaining({ take: 4 }))
    }
  })

  it('reads only id and updatedAt for the sitemap', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    await getPublicProductSitemapRows()
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, isActive: true },
      orderBy: { id: 'asc' },
      select: { id: true, updatedAt: true },
    })
  })

  it('reads distinct category names without loading products', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([{ category: 'hair' }] as never)
    await expect(getPublicProductCategories()).resolves.toEqual(['hair'])
    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { isDeleted: false, isActive: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
      select: { category: true },
    })
  })

  it('uses a narrow projection for the intentional whole-catalog facet scan', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([])
    settingFindUniqueMock.mockResolvedValue(null)
    await getStorefrontFacetProducts()
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: {
        id: true, title: true, titleEn: true, titleLv: true, brand: true,
        price: true, oldPrice: true, rating: true, badges: true, category: true, stock: true,
        createdAt: true, externalId: true, erpPriceMissing: true,
        manualPriceApproved: true, manualApprovedPrice: true,
      },
    }))
  })

  it('keeps stored prices for admin full-catalog consumers', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([{
      ...detailRow,
      externalId: 'erp-19073',
      erpPriceMissing: true,
      manualPriceApproved: false,
      price: 26,
    }] as never)
    settingFindUniqueMock.mockResolvedValue(null)

    const [product] = await getMergedProductsWithPrices()

    expect(product).toMatchObject({ id: '19073', price: 26, priceUnavailable: true })
  })
})

describe('ERP products without a valid B2B price', () => {
  const dbRow = (overrides: Record<string, unknown> = {}) => ({
    id: '20561', title: 'Sublime Mud', titleKey: null, titleEn: null, titleLv: null,
    description: null, brand: 'ALFAPARF', price: 26, oldPrice: 30, rating: 0, ratingCount: 0, reviewCount: 0,
    image: null, images: [], metaTitle: null, metaDescription: null, ogImage: null, ogAlt: null,
    badges: ['sale'], category: 'hair', stock: 1, isActive: true, barcode: null,
    relatedProductIds: [], oftenBoughtTogether: [], minOrderQuantities: null, technicalSpecs: null,
    bulkPricingTiers: [{ quantity: 5, pricePerUnit: 20 }], demoVideo: null, distributorName: null, distributorAddress: null,
    sku: 'APSD25', unitOfMeasure: null, certificates: [], packagingSize: null, compatibleEquipment: [],
    manufacturerName: null, manufacturerAddress: null, manufacturerEmail: null, distributorEmail: null,
    bonusRate: 3, feature1: null, feature1En: null, feature1Lv: null,
    feature2: null, feature2En: null, feature2Lv: null, feature3: null, feature3En: null, feature3Lv: null,
    feature4: null, feature4En: null, feature4Lv: null, specVolume: null, specType: null, specCountry: null,
    isCustom: false, isDeleted: false, externalId: 'APSD25', lastSyncRunId: null,
    erpPriceMissing: true, manualPriceApproved: false, revision: 1,
    createdAt: new Date(), updatedAt: new Date(), ...overrides,
  })

  it('B: the storefront listing never carries the kept legacy price', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([dbRow() as never])
    vi.mocked(prisma.product.count).mockResolvedValue(1)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)

    const { products } = await getDbProductsPaginated({ ids: ['20561'] })

    expect(products[0]).toMatchObject({ id: '20561', priceUnavailable: true, stock: 0, badges: [] })
    expect(products[0]).not.toHaveProperty('price')
    expect(products[0]).not.toHaveProperty('oldPrice')
    expect(products[0]).not.toHaveProperty('bulkPricingTiers')
    expect(products[0]).not.toHaveProperty('erpPriceMissing')
  })

  it('an admin override can neither re-enable nor leak a price for it', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([dbRow() as never])
    vi.mocked(prisma.product.count).mockResolvedValue(1)
    vi.mocked(prisma.keyValueSetting.findUnique).mockImplementation((async ({ where }: { where: { key: string } }) =>
      where.key === 'product-overrides'
        ? { value: { '20561': { price: 19, priceUnavailable: false, manualPriceApproved: true } } }
        : null) as never)

    const { products } = await getDbProductsPaginated({ ids: ['20561'] })

    expect(products[0].priceUnavailable).toBe(true)
    expect(products[0]).not.toHaveProperty('price')
  })

  it('C: an approved local price stays visible', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([dbRow({ manualPriceApproved: true, manualApprovedPrice: 26 }) as never])
    vi.mocked(prisma.product.count).mockResolvedValue(1)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)

    const { products } = await getDbProductsPaginated({ ids: ['20561'] })

    expect(products[0]).toMatchObject({ price: 26, stock: 1 })
    expect(products[0].priceUnavailable).toBeUndefined()
  })

  it('an approved product shows exactly the approved Product.price: an override price is ignored', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([dbRow({ manualPriceApproved: true, manualApprovedPrice: 26 }) as never])
    vi.mocked(prisma.product.count).mockResolvedValue(1)
    vi.mocked(prisma.keyValueSetting.findUnique).mockImplementation((async ({ where }: { where: { key: string } }) =>
      where.key === 'product-overrides'
        ? { value: { '20561': { price: 19, oldPrice: 40, bulkPricingTiers: [{ quantity: 2, pricePerUnit: 10 }], title: 'Renamed' } } }
        : null) as never)

    const { products } = await getDbProductsPaginated({ ids: ['20561'] })

    expect(products[0]).toMatchObject({ price: 26, oldPrice: 30, title: 'Renamed' })
    expect(products[0].bulkPricingTiers).toEqual([{ quantity: 5, pricePerUnit: 20 }])
  })

  it('a stale approval (price changed after approving) hides the price again', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([dbRow({ price: 28, manualPriceApproved: true, manualApprovedPrice: 26 }) as never])
    vi.mocked(prisma.product.count).mockResolvedValue(1)
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)

    const { products } = await getDbProductsPaginated({ ids: ['20561'] })

    expect(products[0].priceUnavailable).toBe(true)
    expect(products[0]).not.toHaveProperty('price')
  })

  it('the admin catalog keeps the stored price and exposes the ERP state', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([dbRow() as never])
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null)

    const [product] = await getAdminProducts()

    expect(product).toMatchObject({ price: 26, erpPriceMissing: true, manualPriceApproved: false, priceUnavailable: true })
  })
})
