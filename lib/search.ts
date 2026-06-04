import type { Product } from '@/data/products'

type SearchResult = {
  results: Product[]
  correctedQuery: string | null
  normalizedQuery: string
}

export function normalizeSearchValue(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokenize(value: string): string[] {
  const normalized = normalizeSearchValue(value)
  return normalized ? normalized.split(' ') : []
}

function getProductSearchText(product: Product): string {
  return normalizeSearchValue(`${product.title} ${product.brand} ${product.purpose ?? ''}`)
}

function getVocabulary(products: Product[]): string[] {
  const words = new Set<string>()

  products.forEach((product) => {
    tokenize(`${product.title} ${product.brand} ${product.purpose ?? ''}`).forEach((token) => {
      if (token.length >= 3) {
        words.add(token)
      }
    })
  })

  return Array.from(words)
}

function levenshteinDistance(source: string, target: string): number {
  if (source === target) return 0
  if (source.length === 0) return target.length
  if (target.length === 0) return source.length

  const sourceLength = source.length
  const targetLength = target.length
  const matrix: number[][] = Array.from({ length: sourceLength + 1 }, () =>
    Array.from({ length: targetLength + 1 }, () => 0)
  )

  for (let i = 0; i <= sourceLength; i += 1) matrix[i][0] = i
  for (let j = 0; j <= targetLength; j += 1) matrix[0][j] = j

  for (let i = 1; i <= sourceLength; i += 1) {
    for (let j = 1; j <= targetLength; j += 1) {
      const cost = source[i - 1] === target[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }

  return matrix[sourceLength][targetLength]
}

function getCorrectedQuery(query: string, products: Product[]): string | null {
  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) return null

  const vocabulary = getVocabulary(products)
  if (vocabulary.length === 0) return null

  let changed = false

  const correctedTokens = queryTokens.map((token) => {
    let bestWord = token
    let bestDistance = Number.POSITIVE_INFINITY

    for (const word of vocabulary) {
      const distance = levenshteinDistance(token, word)
      const allowedDistance = Math.max(1, Math.floor(token.length / 3))

      if (distance <= allowedDistance && distance < bestDistance) {
        bestWord = word
        bestDistance = distance
      }
    }

    if (bestWord !== token) {
      changed = true
    }

    return bestWord
  })

  if (!changed) return null
  return correctedTokens.join(' ')
}

export function searchProducts(products: Product[], query: string): SearchResult {
  const normalizedQuery = normalizeSearchValue(query)

  if (!normalizedQuery) {
    return {
      results: products,
      correctedQuery: null,
      normalizedQuery: ''
    }
  }

  const directResults = products.filter((product) => getProductSearchText(product).includes(normalizedQuery))
  if (directResults.length > 0) {
    return {
      results: directResults,
      correctedQuery: null,
      normalizedQuery
    }
  }

  const correctedQuery = getCorrectedQuery(normalizedQuery, products)
  if (!correctedQuery) {
    return {
      results: [],
      correctedQuery: null,
      normalizedQuery
    }
  }

  const correctedResults = products.filter((product) => getProductSearchText(product).includes(correctedQuery))

  return {
    results: correctedResults,
    correctedQuery,
    normalizedQuery
  }
}

export function getAutocompleteSuggestions(products: Product[], query: string, limit = 6): Product[] {
  const normalizedQuery = normalizeSearchValue(query)
  if (!normalizedQuery) return []

  const ranked = products
    .map((product) => {
      const normalizedTitle = normalizeSearchValue(product.title)
      const normalizedBrand = normalizeSearchValue(product.brand)
      let score = 0

      if (normalizedTitle.startsWith(normalizedQuery)) score += 6
      if (normalizedBrand.startsWith(normalizedQuery)) score += 5
      if (normalizedTitle.includes(normalizedQuery)) score += 3
      if (normalizedBrand.includes(normalizedQuery)) score += 2

      if (score === 0) return null

      return { product, score }
    })
    .filter((entry): entry is { product: Product; score: number } => entry !== null)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      if (b.product.rating !== a.product.rating) return b.product.rating - a.product.rating
      return a.product.price - b.product.price
    })

  return ranked.slice(0, limit).map((entry) => entry.product)
}

export function getRecommendedProducts(products: Product[], query: string, limit = 4): Product[] {
  const normalizedQuery = normalizeSearchValue(query)

  if (!normalizedQuery) {
    return [...products]
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
  }

  const seed = normalizedQuery.split(' ')[0]
  const relevant = products.filter((product) => {
    const text = getProductSearchText(product)
    return text.includes(seed)
  })

  if (relevant.length > 0) {
    return relevant
      .sort((a, b) => b.rating - a.rating)
      .slice(0, limit)
  }

  return [...products]
    .sort((a, b) => b.rating - a.rating)
    .slice(0, limit)
}
