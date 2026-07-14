import { describe, expect, it } from 'vitest'

import { filterEmptySubcategories } from './filter-empty-subcategories'
import type { CategoryConfigItem } from './categories-config'

const makeCategory = (id: string, slugs: string[]): CategoryConfigItem => ({
  id,
  href: `/catalog?cat=${id}`,
  image: `/categories/${id}.jpg`,
  labels: { ru: id, en: id, lv: id },
  subcategories: slugs.map((slug) => ({
    slug,
    labels: { ru: slug, en: slug, lv: slug },
    search: ''
  }))
})

describe('filterEmptySubcategories', () => {
  const categories = [
    makeCategory('hair', ['shampoos', 'conditioners']),
    makeCategory('equipment', ['furniture', 'salon-products', 'gift-ideas'])
  ]
  const products = [
    { category: 'hair', subcategory: 'shampoos' },
    { category: 'hair', subcategory: undefined },
    { category: 'equipment', subcategory: 'furniture' }
  ]

  it('drops subcategories with zero products', () => {
    const result = filterEmptySubcategories(categories, products)
    expect(result[0].subcategories.map((s) => s.slug)).toEqual(['shampoos'])
    expect(result[1].subcategories.map((s) => s.slug)).toEqual(['furniture'])
  })

  it('does not count a product toward a foreign category with the same slug', () => {
    const result = filterEmptySubcategories(
      [makeCategory('face', ['shampoos'])],
      [{ category: 'hair', subcategory: 'shampoos' }]
    )
    expect(result[0].subcategories).toEqual([])
  })

  it('keeps category itself even when all its subcategories are empty', () => {
    const result = filterEmptySubcategories(categories, [])
    expect(result.map((c) => c.id)).toEqual(['hair', 'equipment'])
    expect(result.every((c) => c.subcategories.length === 0)).toBe(true)
  })
})
