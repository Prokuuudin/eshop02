import { describe, expect, it } from 'vitest'
import { PRODUCTS } from '@/data/products'
import {
  normalizeSearchValue,
  searchProducts,
  getAutocompleteSuggestions,
  getRecommendedProducts
} from '@/lib/search'

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
    expect(suggestions.some((item) => item.brand === 'Revitaluxe')).toBe(true)
  })

  it('returns fallback recommendations when query has no direct matches', () => {
    const recommendations = getRecommendedProducts(PRODUCTS, 'zzzz', 4)

    expect(recommendations.length).toBe(4)
  })
})
