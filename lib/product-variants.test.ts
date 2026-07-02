import { describe, expect, it } from 'vitest'
import { getVariantGroups, getMissingRequiredGroups, sumPriceAdjustment } from './product-variants'
import type { VariantGroup, SelectedVariant } from '@/data/products'

describe('getVariantGroups', () => {
  it('returns undefined when technicalSpecs is missing', () => {
    expect(getVariantGroups({})).toBeUndefined()
    expect(getVariantGroups({ technicalSpecs: undefined })).toBeUndefined()
    expect(getVariantGroups({ technicalSpecs: null })).toBeUndefined()
  })

  it('returns undefined when the reserved key is absent', () => {
    expect(getVariantGroups({ technicalSpecs: { 'Объём': '50 мл' } })).toBeUndefined()
  })

  it('parses valid JSON under the reserved key', () => {
    const groups: VariantGroup[] = [
      { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }, { value: 'A-12', priceAdjustment: 1.5 }] },
    ]
    const result = getVariantGroups({ technicalSpecs: { __variantGroupsJson: JSON.stringify(groups) } })
    expect(result).toEqual(groups)
  })

  it('returns undefined on malformed JSON instead of throwing', () => {
    expect(getVariantGroups({ technicalSpecs: { __variantGroupsJson: '{not json' } })).toBeUndefined()
  })

  it('returns undefined when the parsed value is not an array', () => {
    expect(getVariantGroups({ technicalSpecs: { __variantGroupsJson: '{"a":1}' } })).toBeUndefined()
  })
})

describe('getMissingRequiredGroups', () => {
  const groups: VariantGroup[] = [
    { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }] },
    { name: 'Izmērs', required: false, options: [{ value: 'M' }] },
  ]

  it('returns required groups with no matching selection', () => {
    const missing = getMissingRequiredGroups(groups, [])
    expect(missing).toEqual([groups[0]])
  })

  it('returns empty array when all required groups are selected', () => {
    const selected: SelectedVariant[] = [{ groupName: 'Krāsu numurs', value: 'A-11' }]
    expect(getMissingRequiredGroups(groups, selected)).toEqual([])
  })

  it('ignores optional groups entirely', () => {
    expect(getMissingRequiredGroups(groups, [{ groupName: 'Krāsu numurs', value: 'A-11' }])).toEqual([])
  })

  it('treats undefined groups as no groups', () => {
    expect(getMissingRequiredGroups(undefined, [])).toEqual([])
  })
})

describe('sumPriceAdjustment', () => {
  it('sums priceAdjustment across selected variants', () => {
    const selected: SelectedVariant[] = [
      { groupName: 'a', value: '1', priceAdjustment: 1.5 },
      { groupName: 'b', value: '2', priceAdjustment: 2.5 },
    ]
    expect(sumPriceAdjustment(selected)).toBe(4)
  })

  it('treats missing priceAdjustment as 0', () => {
    expect(sumPriceAdjustment([{ groupName: 'a', value: '1' }])).toBe(0)
  })

  it('returns 0 for an empty array', () => {
    expect(sumPriceAdjustment([])).toBe(0)
  })
})
