import { describe, expect, it } from 'vitest'
import { interleavePromoTiles } from './catalog-promo-slots'

const products = (count: number) => Array.from({ length: count }, (_, i) => `p${i}`)
const shape = (entries: ReturnType<typeof interleavePromoTiles<string, string>>) =>
  entries.map((entry) => entry.kind === 'product' ? entry.item : `[${entry.promo}]`)

describe('interleavePromoTiles', () => {
  it('returns products untouched when there are no promos', () => {
    expect(shape(interleavePromoTiles(products(5), []))).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
  })

  it('shows a single promo once, in slot 3', () => {
    expect(shape(interleavePromoTiles(products(6), ['a']))).toEqual(['p0', 'p1', '[a]', 'p2', 'p3', 'p4', 'p5'])
  })

  it('shows two promos once each, in slots 3 and 5', () => {
    expect(shape(interleavePromoTiles(products(6), ['a', 'b']))).toEqual(['p0', 'p1', '[a]', 'p2', '[b]', 'p3', 'p4', 'p5'])
  })

  it('shows three promos once each, in slots 3, 5 and 7', () => {
    expect(shape(interleavePromoTiles(products(6), ['a', 'b', 'c']))).toEqual([
      'p0', 'p1', '[a]', 'p2', '[b]', 'p3', '[c]', 'p4', 'p5',
    ])
  })

  it('puts the leftover promos after the products when the filter leaves few products', () => {
    expect(shape(interleavePromoTiles(products(1), ['a', 'b']))).toEqual(['p0', '[a]', '[b]'])
    expect(shape(interleavePromoTiles(products(3), ['a', 'b', 'c']))).toEqual(['p0', 'p1', '[a]', 'p2', '[b]', '[c]'])
  })
})
