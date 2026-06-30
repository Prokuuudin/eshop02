import { describe, expect, it } from 'vitest'

import { getSubcategorySearchBySlug } from './categories'

describe('categories subcategory resolvers', () => {
  it('resolves search phrase by known slug', () => {
    expect(getSubcategorySearchBySlug('shampoos')).toBe('ШАМПУНИ')
  })

  it('returns empty search phrase for unknown slug', () => {
    expect(getSubcategorySearchBySlug('unknown-slug')).toBe('')
  })
})
