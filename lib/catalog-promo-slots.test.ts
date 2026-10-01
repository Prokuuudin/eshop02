import { describe, expect, it } from 'vitest'
import { interleavePromoTiles } from './catalog-promo-slots'

const products = (count: number) => Array.from({ length: count }, (_, i) => `p${i}`)
const shape = (entries: ReturnType<typeof interleavePromoTiles<string, string>>) =>
  entries.map((entry) => entry.kind === 'product' ? entry.item : `[${entry.promo}]`)

describe('interleavePromoTiles', () => {
  it('returns products untouched when there are no promos', () => {
    expect(shape(interleavePromoTiles(products(5), []))).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
  })

  it('places the first promo after three products, then one after every eight', () => {
    const result = shape(interleavePromoTiles(products(20), ['a', 'b', 'c', 'd']))
    expect(result.indexOf('[a]')).toBe(3)
    expect(result.indexOf('[b]')).toBe(12)
    expect(result.indexOf('[c]')).toBe(21)
    expect(result).not.toContain('[d]')
    expect(result.filter((value) => value.startsWith('p'))).toEqual(products(20))
  })

  it('shows each promo at most once', () => {
    const result = shape(interleavePromoTiles(products(40), ['a']))
    expect(result.filter((value) => value === '[a]')).toHaveLength(1)
  })

  it('appends one promo after a short result instead of dropping it', () => {
    expect(shape(interleavePromoTiles(products(2), ['a', 'b']))).toEqual(['p0', 'p1', '[a]'])
  })

  it('shows no promo for an empty result', () => {
    expect(interleavePromoTiles([], ['a'])).toEqual([])
  })
})
