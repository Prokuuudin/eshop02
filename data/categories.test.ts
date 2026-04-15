import { describe, expect, it } from 'vitest'

import {
  SUBCATEGORIES_BY_ID,
  getSubcategoryProductIdsBySlug,
  getSubcategorySearchBySlug
} from './categories'

describe('categories subcategory resolvers', () => {
  it('resolves search phrase by known slug', () => {
    expect(getSubcategorySearchBySlug('shampoos')).toBe('ШАМПУНИ')
  })

  it('returns empty search phrase for unknown slug', () => {
    expect(getSubcategorySearchBySlug('unknown-slug')).toBe('')
  })

  it('resolves product ids by known slug', () => {
    const ids = getSubcategoryProductIdsBySlug('shampoos')
    expect(ids).not.toBeNull()
    expect(ids?.has('p2')).toBe(true)
  })

  it('returns null for unknown product-id mapping slug', () => {
    expect(getSubcategoryProductIdsBySlug('unknown-slug')).toBeNull()
  })

  it('has product mapping for every declared subcategory slug', () => {
    const allSlugs = Object.values(SUBCATEGORIES_BY_ID)
      .flat()
      .map((item) => item.slug)

    allSlugs.forEach((slug) => {
      expect(getSubcategoryProductIdsBySlug(slug)).not.toBeNull()
    })
  })
})
