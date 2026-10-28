import type { Product } from '@/data/products'

/** Shared storefront search: header suggestions, the catalog page and its client-side refilter. */
export const SEARCH_MIN_LENGTH = 2
export const SEARCH_MAX_LENGTH = 100
const MAX_TOKENS = 8

type SearchableProduct = Pick<Product, 'title' | 'brand'>
  & Partial<Pick<Product, 'sku' | 'barcode' | 'stock' | 'priceUnavailable'>>

/** Case-, accent- and spacing-insensitive form: "  Šampūns  ĀBOLS " → "sampuns abols", "Ёлка" → "елка". */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKD').replace(/\p{M}+/gu, '').toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Letters and digits only, for codes typed with or without separators: "SE-123 45" → "se12345". */
function compactSearchText(value: string): string {
  return normalizeSearchText(value).replace(/[^\p{L}\p{N}]+/gu, '')
}

export type ProductSearchQuery = {
  normalized: string
  compact: string
  tokens: Array<{ text: string; compact: string }>
}

/** Null when the query is too short to search (the caller shows nothing / everything). */
export function parseProductSearchQuery(raw: string): ProductSearchQuery | null {
  const normalized = normalizeSearchText(raw.slice(0, SEARCH_MAX_LENGTH))
  if (normalized.length < SEARCH_MIN_LENGTH) return null
  const tokens = normalized.split(' ').slice(0, MAX_TOKENS)
    .map((text) => ({ text, compact: compactSearchText(text) }))
    .filter((token) => token.compact.length > 0)
  if (tokens.length === 0) return null
  return { normalized, compact: compactSearchText(normalized), tokens }
}

/**
 * The title shown in the current language plus the base (RU) title — never another language's title,
 * so results match what the shopper reads (same rule as the catalog filters since 2026-10-05).
 */
function titles(product: SearchableProduct, localizedTitle?: string): string[] {
  return [...new Set([localizedTitle, product.title].filter((value): value is string => Boolean(value)))]
}

/**
 * Every word of the query must occur in the shown or base title, the brand, SKU or barcode,
 * in any order. Codes also match without separators ("se12345" finds "SE-123 45").
 */
export function matchesProductSearch(product: SearchableProduct, query: ProductSearchQuery, localizedTitle?: string): boolean {
  const text = normalizeSearchText([...titles(product, localizedTitle), product.brand, product.sku ?? '', product.barcode ?? ''].join(' | '))
  // Punctuation inside a word is optional on either side ("l'oreal" / "loreal", "60/1" / "601"),
  // but words are never glued together, so a token cannot match across two words.
  const joined = text.replace(/[^\p{L}\p{N}\s|]+/gu, '')
  const codes = [product.sku, product.barcode].filter(Boolean).map((value) => compactSearchText(value as string)).join(' ')
  return query.tokens.every((token) => text.includes(token.text)
    || joined.includes(token.compact)
    || (token.compact.length >= SEARCH_MIN_LENGTH && codes.includes(token.compact)))
}

/** Higher is better: exact code, then title prefix, then brand, then a title word prefix. */
export function rankProductSearchMatch(product: SearchableProduct, query: ProductSearchQuery, localizedTitle?: string): number {
  let score = 0
  const codes = [product.sku, product.barcode].filter(Boolean).map((value) => compactSearchText(value as string))
  if (codes.includes(query.compact)) score += 200
  const productTitles = titles(product, localizedTitle).map(normalizeSearchText)
  if (productTitles.some((title) => title.startsWith(query.normalized))) score += 50
  const brand = normalizeSearchText(product.brand)
  if (brand === query.normalized) score += 40
  else if (brand.startsWith(query.tokens[0].text)) score += 30
  if (productTitles.some((title) => title.split(/[^\p{L}\p{N}]+/u).some((word) => word.startsWith(query.tokens[0].text)))) score += 20
  // Products a customer can actually buy come first among equally relevant ones.
  if ((product.stock ?? 0) > 0 && !product.priceUnavailable) score += 5
  return score
}
