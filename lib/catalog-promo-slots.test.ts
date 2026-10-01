import { describe, expect, it } from 'vitest'
import { interleavePromoTiles } from './catalog-promo-slots'

const products = (count: number) => Array.from({ length: count }, (_, i) => `p${i}`)
const shape = (entries: ReturnType<typeof interleavePromoTiles<string, string>>) =>
  entries.map((entry) => entry.kind === 'product' ? entry.item : `[${entry.promo}]`)

describe('interleavePromoTiles', () => {
  it('returns products untouched when there are no promos', () => {
    expect(shape(interleavePromoTiles(products(5), []))).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
  })

  it('puts a promo in every third slot, cycling through the promos', () => {
    expect(shape(interleavePromoTiles(products(8), ['a', 'b']))).toEqual([
      'p0', 'p1', '[a]', 'p2', 'p3', '[b]', 'p4', 'p5', '[a]', 'p6', 'p7',
    ])
  })

  it('keeps every product in its original order', () => {
    const result = shape(interleavePromoTiles(products(20), ['a']))
    expect(result.filter((value) => value.startsWith('p'))).toEqual(products(20))
    result.forEach((value, index) => expect(value === '[a]').toBe(index % 3 === 2))
  })

  it('never ends the grid on a promo', () => {
    expect(shape(interleavePromoTiles(products(4), ['a']))).toEqual(['p0', 'p1', '[a]', 'p2', 'p3'])
  })

  it('shows no promo when the filter leaves fewer than three products', () => {
    expect(shape(interleavePromoTiles(products(2), ['a']))).toEqual(['p0', 'p1'])
    expect(interleavePromoTiles([], ['a'])).toEqual([])
  })
})
