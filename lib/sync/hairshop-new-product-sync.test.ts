import { describe, expect, it } from 'vitest'
import { hasValidB2BPrice, isSellable } from '@/lib/product-sellability'
import {
  buildHairshopProductCreateData,
  mapLegacyCategory,
  planHairshopNewProducts,
  type ExistingProductIdentity,
  type HairshopNewProductCandidate,
} from './hairshop-new-product-sync'

const candidate = (overrides: Partial<HairshopNewProductCandidate> = {}): HairshopNewProductCandidate => ({
  legacyProductId: 9001,
  sku: 'NEW-9001',
  ean: '4750000009001',
  published: true,
  titles: { default: 'Default name', ru: 'Название', lv: 'Nosaukums', en: 'Name' },
  descriptions: { default: 'Default description', ru: 'Описание', lv: 'Apraksts', en: 'Description' },
  metaTitles: { ru: 'Meta title' },
  metaDescriptions: { ru: 'Meta description' },
  categoryNames: ['Šampūni'],
  manufacturerName: 'Brand',
  images: ['https://hairshop.lv/content/images/thumbs/0000123_product.jpeg'],
  createdOnUtc: '2026-10-28T10:00:00.000Z',
  updatedOnUtc: '2026-10-28T11:00:00.000Z',
  ...overrides,
})

const existing = (overrides: Partial<ExistingProductIdentity> = {}): ExistingProductIdentity => ({
  id: 'existing-1',
  externalId: 'EXISTING-1',
  sku: 'EXISTING-1',
  barcode: '4750000000001',
  isDeleted: false,
  ...overrides,
})

describe('planHairshopNewProducts', () => {
  it('plans an absent product once and treats an exact rerun as already imported', () => {
    const source = candidate()
    const first = planHairshopNewProducts([source], [])
    expect(first.decisions[0]).toMatchObject({ status: 'would_create', targetProductId: 'nop390-9001' })
    expect(first.insertable).toEqual([source])

    const rerun = planHairshopNewProducts([source], [existing({
      id: 'nop390-9001', externalId: source.sku, sku: source.sku, barcode: source.ean,
    })])
    expect(rerun.decisions[0]).toMatchObject({ status: 'already_exists', reasons: ['EXACT_LEGACY_PRODUCT_ALREADY_IMPORTED'] })
    expect(rerun.insertable).toHaveLength(0)
  })

  it('does not create when SKU or EAN already belongs to an existing product', () => {
    const source = candidate()
    const plan = planHairshopNewProducts([source], [existing({ sku: source.sku, externalId: null, barcode: null })])
    expect(plan.decisions[0]).toMatchObject({ status: 'already_exists', reasons: ['EXISTING_SKU_OR_EAN_MATCH'] })
    expect(plan.insertable).toHaveLength(0)
  })

  it('reports an ambiguous SKU/EAN split instead of merging or creating', () => {
    const source = candidate()
    const plan = planHairshopNewProducts([source], [
      existing({ id: 'sku-owner', sku: source.sku, externalId: null, barcode: null }),
      existing({ id: 'ean-owner', sku: 'OTHER', externalId: null, barcode: source.ean }),
    ])
    expect(plan.decisions[0]).toMatchObject({ status: 'conflict' })
    expect(plan.decisions[0].reasons).toContain('AMBIGUOUS_EXISTING_IDENTITIES')
    expect(plan.decisions[0].matchedProductIds).toEqual(['ean-owner', 'sku-owner'])
    expect(plan.insertable).toHaveLength(0)
  })

  it.each(['2468BR', '2368BR'])('always sends protected SKU %s to manual review', sku => {
    const plan = planHairshopNewProducts([candidate({ sku, ean: null })], [])
    expect(plan.decisions[0]).toMatchObject({ status: 'conflict', reasons: ['EXPLICIT_MANUAL_REVIEW_SKU'] })
    expect(plan.insertable).toHaveLength(0)
  })

  it('rejects duplicate source SKU and EAN values within one request', () => {
    const products = [candidate(), candidate({ legacyProductId: 9002 })]
    const plan = planHairshopNewProducts(products, [])
    expect(plan.insertable).toHaveLength(0)
    expect(plan.decisions.every(item => item.status === 'conflict')).toBe(true)
    expect(plan.decisions[0].reasons).toEqual(expect.arrayContaining(['DUPLICATE_SOURCE_SKU', 'DUPLICATE_SOURCE_EAN']))
  })

  it('treats a soft-deleted claimant as a conflict', () => {
    const source = candidate()
    const plan = planHairshopNewProducts([source], [existing({ sku: source.sku, isDeleted: true })])
    expect(plan.decisions[0]).toMatchObject({ status: 'conflict' })
    expect(plan.decisions[0].reasons).toContain('SOFT_DELETED_IDENTITY_CLAIM')
  })
})

describe('new Product mapping', () => {
  it('creates catalog content but leaves price and stock under GrinS authority', () => {
    const data = buildHairshopProductCreateData(candidate(), 'run-12345678')
    expect(data).toMatchObject({
      id: 'nop390-9001',
      externalId: 'NEW-9001',
      sku: 'NEW-9001',
      barcode: '4750000009001',
      title: 'Название',
      titleLv: 'Nosaukums',
      titleEn: 'Name',
      description: 'Описание',
      technicalSpecs: { __descriptionEn: 'Description', __descriptionLv: 'Apraksts' },
      brand: 'Brand',
      manufacturerName: 'Brand',
      category: 'hair',
      price: 0,
      stock: 0,
      erpPriceMissing: true,
      isActive: true,
      isDeleted: false,
      lastSyncRunId: 'hairshop-catalog:run-12345678',
    })

    const sellability = {
      externalId: data.externalId as string,
      erpPriceMissing: data.erpPriceMissing as boolean,
      manualPriceApproved: data.manualPriceApproved as boolean,
      manualApprovedPrice: data.manualApprovedPrice,
      price: data.price,
    }
    expect(hasValidB2BPrice(sellability)).toBe(false)
    expect(isSellable({
      ...sellability,
      isActive: data.isActive as boolean,
      isDeleted: data.isDeleted as boolean,
      stock: data.stock as number,
    })).toBe(false)
  })

  it('uses uncategorized instead of guessing an unknown category', () => {
    expect(mapLegacyCategory(['Completely unknown'])).toEqual({ category: 'uncategorized', warning: 'CATEGORY_UNRESOLVED' })
  })
})
