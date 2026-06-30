import { describe, expect, it } from 'vitest'
import type { Product } from '@/data/products'
import {
  normalizeSearchValue,
  searchProducts,
  getAutocompleteSuggestions,
  getRecommendedProducts
} from '@/lib/search'

const PRODUCTS: Product[] = [
  { id: 't1', title: 'Крем для лица увлажняющий', brand: 'revitaluxe', price: 2500, rating: 4.7, category: 'face', stock: 3 },
  { id: 't2', title: 'Шампунь для волос', brand: 'black', price: 1200, rating: 4.4, category: 'hair', stock: 8 },
  { id: 't3', title: 'Сыворотка омолаживающая', brand: 'feetcalm', price: 4100, rating: 4.9, category: 'face', stock: 22 },
  { id: 't4', title: 'Маска для волос', brand: 'frutti', price: 900, rating: 4.2, category: 'hair', stock: 0 },
  { id: 't5', title: 'Крем для тела', brand: 'luxina', price: 1500, rating: 4.3, category: 'body', stock: 12 },
]

describe('search utils', () => {
  it('normalizes spaces and punctuation', () => {
    expect(normalizeSearchValue('  Крем,   для   лица!!! ')).toBe('крем для лица')
  })

  it('returns corrected query for small typo', () => {
    const result = searchProducts(PRODUCTS, 'кремм')

    expect(result.correctedQuery).toBe('крем')
    expect(result.results.length).toBeGreaterThan(0)
  })

  it('returns autocomplete suggestions by title/brand relevance', () => {
    const suggestions = getAutocompleteSuggestions(PRODUCTS, 'rev', 5)

    expect(suggestions.length).toBeGreaterThan(0)
    expect(suggestions.some((item) => item.brand === 'revitaluxe')).toBe(true)
  })

  it('returns fallback recommendations when query has no direct matches', () => {
    const recommendations = getRecommendedProducts(PRODUCTS, 'zzzz', 4)

    expect(recommendations.length).toBe(4)
  })
})
