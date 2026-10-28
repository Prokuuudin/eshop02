import { describe, expect, it } from 'vitest'
import { matchesProductSearch, normalizeSearchText, parseProductSearchQuery, rankProductSearchMatch } from './product-search'

const IGORA = {
  title: 'Schwarzkopf Professional Igora Royal краска для волос 60 мл',
  titleLv: 'Schwarzkopf Professional Igora Royal matu krāsa 60ml',
  titleEn: 'Schwarzkopf Professional Igora Royal hair color 60ml',
  brand: 'SCHWARZKOPF PROFESSIONAL',
  sku: 'IG-RO 60/1',
  barcode: '4045787199574',
  stock: 4,
}
const SHAMPOO = {
  title: 'KALLOS KJMN Argan шампунь для окрашенных волос 5000 мл',
  titleLv: 'KALLOS KJMN ARGAN šampūns krāsotiem matiem 5000ml',
  brand: 'KALLOS COSMETICS',
  sku: '12483',
  stock: 10,
}
const LOREAL = { title: "L'Oreal Serie Expert Liss Unlimited маска 250 мл", brand: "L'OREAL PROFESSIONNEL", stock: 0 }

const q = (raw: string) => {
  const parsed = parseProductSearchQuery(raw)
  if (!parsed) throw new Error(`query "${raw}" was not searchable`)
  return parsed
}

describe('normalizeSearchText', () => {
  it('ignores case, diacritics and extra spaces', () => {
    expect(normalizeSearchText('  Šampūns   KRĀSOTIEM ')).toBe('sampuns krasotiem')
    expect(normalizeSearchText('Ёлка ЙОД')).toBe('елка иод')
  })
})

describe('parseProductSearchQuery', () => {
  it('needs at least two characters', () => {
    expect(parseProductSearchQuery('')).toBeNull()
    expect(parseProductSearchQuery('   ')).toBeNull()
    expect(parseProductSearchQuery('a')).toBeNull()
    expect(parseProductSearchQuery(' ab ')).not.toBeNull()
  })

  it('ignores pure punctuation and caps the length and word count', () => {
    expect(parseProductSearchQuery('-- //')).toBeNull()
    expect(q('x'.repeat(500)).normalized).toHaveLength(100)
    expect(q('a1 b2 c3 d4 e5 f6 g7 h8 i9 j10').tokens).toHaveLength(8)
  })
})

describe('matchesProductSearch', () => {
  it.each([
    ['the full title', 'Schwarzkopf Professional Igora Royal краска для волос 60 мл'],
    ['part of the title', 'igora roy'],
    ['words in any order', 'royal igora 60'],
    ['the brand', 'schwarzkopf'],
    ['the shown Latvian title', 'matu krāsa'],
    ['the shown Latvian title without diacritics', 'matu krasa'],
    ['the shown English title', 'hair color'],
    ['Cyrillic words', 'КРАСКА ДЛЯ'],
    ['the SKU as stored', 'IG-RO 60/1'],
    ['the SKU without separators', 'igro601'],
    ['the barcode', '4045787199574'],
    ['part of the barcode', '7871995'],
  ])('finds a product by %s', (_label, query) => {
    const localized = /krāsa|krasa/.test(query) ? IGORA.titleLv : /hair color/.test(query) ? IGORA.titleEn : undefined
    expect(matchesProductSearch(IGORA, q(query), localized)).toBe(true)
  })

  it("does not search another language's title (only the shown and the base title)", () => {
    expect(matchesProductSearch(IGORA, q('hair color'), IGORA.titleLv)).toBe(false)
    expect(matchesProductSearch(IGORA, q('matu krasa'), IGORA.titleEn)).toBe(false)
    expect(matchesProductSearch(IGORA, q('краска'), IGORA.titleLv)).toBe(true)
  })

  it('requires every word to match', () => {
    expect(matchesProductSearch(IGORA, q('igora shampoo'))).toBe(false)
    expect(matchesProductSearch(SHAMPOO, q('argan 5000'))).toBe(true)
  })

  it('treats punctuation in the query as optional', () => {
    expect(matchesProductSearch(LOREAL, q("l'oreal"))).toBe(true)
    expect(matchesProductSearch(LOREAL, q('loreal liss'))).toBe(true)
  })

  it('treats SQL-like input as plain text', () => {
    expect(matchesProductSearch(IGORA, q("'; DROP TABLE \"Product\"; --"))).toBe(false)
    // LIKE wildcards are plain characters, not "match anything".
    expect(matchesProductSearch(IGORA, q('%zz_%'))).toBe(false)
    expect(parseProductSearchQuery('%%')).toBeNull()
  })

  it('does not match a word glued across two words', () => {
    expect(matchesProductSearch(IGORA, q('royalkraska'))).toBe(false)
  })

  it('uses the localized title passed by the caller', () => {
    expect(matchesProductSearch({ title: 'Маска', brand: 'X' }, q('mask'), 'Hair mask')).toBe(true)
  })
})

describe('rankProductSearchMatch', () => {
  it('puts an exact code match first, then a title prefix, then a brand match', () => {
    const byCode = rankProductSearchMatch(SHAMPOO, q('12483'))
    const byTitle = rankProductSearchMatch(SHAMPOO, q('kallos kjmn'))
    const byWord = rankProductSearchMatch(SHAMPOO, q('argan'))
    expect(byCode).toBeGreaterThan(byTitle)
    expect(byTitle).toBeGreaterThan(byWord)
  })

  it('prefers an available product among equally relevant ones', () => {
    expect(rankProductSearchMatch({ ...LOREAL, stock: 5 }, q('liss'))).toBeGreaterThan(rankProductSearchMatch(LOREAL, q('liss')))
  })
})
