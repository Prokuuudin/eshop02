import { describe, expect, it, vi, beforeEach } from 'vitest'

const settingFindUniqueMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/prisma', () => {
  const client = {
    product: {
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
  getAdminProductsPaginated,
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
