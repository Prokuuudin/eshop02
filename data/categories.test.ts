import { describe, expect, it } from 'vitest'

import { CATEGORY_CARDS, SUBCATEGORIES_BY_ID, getSubcategorySearchBySlug } from './categories'

describe('categories subcategory resolvers', () => {
  it('resolves search phrase by known slug', () => {
    expect(getSubcategorySearchBySlug('shampoos')).toBe('ШАМПУНИ')
  })

  it('returns empty search phrase for unknown slug', () => {
    expect(getSubcategorySearchBySlug('unknown-slug')).toBe('')
  })
})

describe('category consolidation shape', () => {
  it('has exactly the 5 consolidated category cards, in order', () => {
    expect(CATEGORY_CARDS.map((c) => c.id)).toEqual(['hair', 'nails', 'face', 'body', 'equipment'])
  })

  it('includes leg-care and hand-care under body', () => {
    const slugs = SUBCATEGORIES_BY_ID.body.map((s) => s.slug)
    expect(slugs).toContain('leg-care')
    expect(slugs).toContain('hand-care')
  })

  it('includes the merged misc subcategories under equipment', () => {
    const slugs = SUBCATEGORIES_BY_ID.equipment.map((s) => s.slug)
    expect(slugs).toEqual(
      expect.arrayContaining([
        'gift-ideas',
        'consumables',
        'salon-products',
        'aprons-capes',
        'hair-accessories',
        'disinfection',
      ])
    )
  })

  it('no longer has a "new" category', () => {
    expect(SUBCATEGORIES_BY_ID.new).toBeUndefined()
    expect('new' in SUBCATEGORIES_BY_ID).toBe(false)
  })
})
