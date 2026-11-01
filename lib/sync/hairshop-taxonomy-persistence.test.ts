import { describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { validateTaxonomyHierarchy } from './hairshop-taxonomy-persistence'
import type { TaxonomySnapshotData } from './hairshop-taxonomy-sync'

const timestamp = '2026-10-30T15:00:00.000Z'

function data(): TaxonomySnapshotData {
  return {
    categories: [
      { categoryId: '1', parentCategoryId: null, names: { default: 'Root' }, slugs: {}, published: true, createdOnUtc: timestamp, updatedOnUtc: timestamp },
      { categoryId: '2', parentCategoryId: '1', names: { default: 'Child' }, slugs: {}, published: true, createdOnUtc: timestamp, updatedOnUtc: timestamp },
    ],
    manufacturers: [
      { manufacturerId: '10', names: { default: 'Brand' }, slugs: {}, published: true, createdOnUtc: timestamp, updatedOnUtc: timestamp },
    ],
    productCategories: [{ productId: '100', categoryId: '2', displayOrder: 1, isFeaturedProduct: false }],
    productManufacturers: [{ productId: '100', manufacturerId: '10', displayOrder: 1, isFeaturedProduct: false }],
  }
}

describe('taxonomy mirror validation', () => {
  it('accepts a complete acyclic hierarchy', () => {
    expect(() => validateTaxonomyHierarchy(data())).not.toThrow()
  })

  it('rejects missing parents and cycles before mirror writes', () => {
    const missing = data()
    missing.categories[1].parentCategoryId = '999'
    expect(() => validateTaxonomyHierarchy(missing)).toThrowError(expect.objectContaining({ code: 'MISSING_CATEGORY_PARENT' }))

    const cyclic = data()
    cyclic.categories[0].parentCategoryId = '2'
    expect(() => validateTaxonomyHierarchy(cyclic)).toThrowError(expect.objectContaining({ code: 'CATEGORY_CYCLE' }))
  })

  it('rejects duplicate edges and orphaned mappings', () => {
    const duplicate = data()
    duplicate.productCategories.push({ ...duplicate.productCategories[0] })
    expect(() => validateTaxonomyHierarchy(duplicate)).toThrowError(expect.objectContaining({ code: 'DUPLICATE_PRODUCT_CATEGORY' }))

    const orphaned = data()
    orphaned.productManufacturers[0].manufacturerId = '999'
    expect(() => validateTaxonomyHierarchy(orphaned)).toThrowError(expect.objectContaining({ code: 'MISSING_MAPPING_MANUFACTURER' }))
  })

  it('walks a very deep hierarchy without recursion and still finds a long cycle', () => {
    const deep = data()
    deep.productCategories = []
    deep.categories = Array.from({ length: 50_000 }, (_, index) => ({
      categoryId: String(index + 1),
      parentCategoryId: index === 0 ? null : String(index),
      names: { default: `C${index + 1}` }, slugs: {}, published: true, createdOnUtc: timestamp, updatedOnUtc: timestamp,
    }))
    expect(() => validateTaxonomyHierarchy(deep)).not.toThrow()

    deep.categories[0].parentCategoryId = '50000'
    expect(() => validateTaxonomyHierarchy(deep)).toThrowError(expect.objectContaining({ code: 'CATEGORY_CYCLE' }))
  })

  it('rejects duplicate source IDs across batches', () => {
    const duplicate = data()
    duplicate.manufacturers.push({ ...duplicate.manufacturers[0] })
    expect(() => validateTaxonomyHierarchy(duplicate)).toThrowError(expect.objectContaining({ code: 'DUPLICATE_MANUFACTURER' }))
    const category = data()
    category.categories.push({ ...category.categories[0] })
    expect(() => validateTaxonomyHierarchy(category)).toThrowError(expect.objectContaining({ code: 'DUPLICATE_CATEGORY' }))
  })
})
