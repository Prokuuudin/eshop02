import { describe, expect, it } from 'vitest'
import type { VariantGroup, SelectedVariant } from '@/data/products'
import { getMissingRequiredGroups, sumPriceAdjustment } from './product-variants'

describe('getMissingRequiredGroups', () => {
  const groups: VariantGroup[] = [
    { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }] },
    { name: 'Izmērs', required: false, options: [{ value: 'M' }] },
  ]

  it('returns required groups with no matching selection', () => {
    const result = getMissingRequiredGroups(groups, [])
    expect(result).toEqual([groups[0]])
  })

  it('returns empty when the required group is selected', () => {
    const selected: SelectedVariant[] = [{ groupName: 'Krāsu numurs', value: 'A-11' }]
    expect(getMissingRequiredGroups(groups, selected)).toEqual([])
  })

  it('ignores optional groups entirely', () => {
    expect(getMissingRequiredGroups(groups, []).some(g => g.name === 'Izmērs')).toBe(false)
  })

  it('returns empty for undefined groups', () => {
    expect(getMissingRequiredGroups(undefined, [])).toEqual([])
  })
})

describe('sumPriceAdjustment', () => {
  it('sums priceAdjustment across selections', () => {
    const selected: SelectedVariant[] = [
      { groupName: 'A', value: '1', priceAdjustment: 5 },
      { groupName: 'B', value: '2', priceAdjustment: 2.5 },
    ]
    expect(sumPriceAdjustment(selected)).toBe(7.5)
  })

  it('treats missing priceAdjustment as 0', () => {
    const selected: SelectedVariant[] = [{ groupName: 'A', value: '1' }]
    expect(sumPriceAdjustment(selected)).toBe(0)
  })

  it('returns 0 for an empty array', () => {
    expect(sumPriceAdjustment([])).toBe(0)
  })
})
