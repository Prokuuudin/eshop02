import { describe, expect, it } from 'vitest'
import type { Product } from '@/data/products'
import { sortBrandProductsNewestFirst } from '@/lib/catalog-product-sort'

const product = (id: string, createdAt?: Date): Product => ({
  id,
  title: id,
  brand: 'Brand',
  price: 10,
  rating: 0,
  category: 'hair',
  stock: 1,
  createdAt,
})

describe('sortBrandProductsNewestFirst', () => {
  it('places recently added products first', () => {
    const products = [
      product('old', new Date('2025-01-01T00:00:00Z')),
      product('new', new Date('2026-08-20T00:00:00Z')),
      product('middle', new Date('2026-01-01T00:00:00Z')),
    ]

    expect(sortBrandProductsNewestFirst(products).map(({ id }) => id)).toEqual([
      'new',
      'middle',
      'old',
    ])
  })

  it('puts undated products last and preserves their relative order', () => {
    const products = [
      product('undated-a'),
      product('dated', new Date('2026-08-20T00:00:00Z')),
      product('undated-b'),
    ]

    expect(sortBrandProductsNewestFirst(products).map(({ id }) => id)).toEqual([
      'dated',
      'undated-a',
      'undated-b',
    ])
  })
})
