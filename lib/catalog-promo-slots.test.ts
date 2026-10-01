import { describe, expect, it } from 'vitest'
import { interleavePromoTiles } from './catalog-promo-slots'

const products = (count: number) => Array.from({ length: count }, (_, i) => `p${i}`)
const shape = (entries: ReturnType<typeof interleavePromoTiles<string, string>>) =>
  entries.map((entry) => entry.kind === 'product' ? entry.item : `[${entry.promo}]`)
const promoSlots = (entries: string[]) =>
  entries.flatMap((value, index) => value.startsWith('[') ? [index + 1] : [])

describe('interleavePromoTiles', () => {
  it('returns products untouched when there are no promos', () => {
    expect(shape(interleavePromoTiles(products(5), []))).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
  })

  it('shows a single promo once, in slot 7', () => {
    const result = shape(interleavePromoTiles(products(20), ['a']))
    expect(result.slice(0, 8)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4', 'p5', '[a]', 'p6'])
    expect(promoSlots(result)).toEqual([7])
  })

  it('puts five products between consecutive promos: slots 7, 13, 19', () => {
    const result = shape(interleavePromoTiles(products(20), ['a', 'b', 'c']))
    expect(promoSlots(result)).toEqual([7, 13, 19])
    expect(result.slice(6, 13)).toEqual(['[a]', 'p6', 'p7', 'p8', 'p9', 'p10', '[b]'])
    expect(result.filter((value) => value.startsWith('p'))).toEqual(products(20))
  })

  it('puts the leftover promos after the products when the filter leaves few products', () => {
    expect(shape(interleavePromoTiles(products(4), ['a', 'b']))).toEqual(['p0', 'p1', 'p2', 'p3', '[a]', '[b]'])
    expect(shape(interleavePromoTiles(products(8), ['a', 'b']))).toEqual([
      'p0', 'p1', 'p2', 'p3', 'p4', 'p5', '[a]', 'p6', 'p7', '[b]',
    ])
  })
})
