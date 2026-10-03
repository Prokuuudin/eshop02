import { describe, expect, it } from 'vitest'
import { getVariantGroups, getMissingRequiredGroups, getPreselectedVariants, isSelectedVariantsInput, resolveSelectedVariants, sumPriceAdjustment } from './product-variants'
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

describe('getPreselectedVariants', () => {
  it('returns preselected option per group with its priceAdjustment', () => {
    const groups: VariantGroup[] = [
      {
        name: 'COLOR BASIC',
        required: true,
        displayType: 'imageSquares',
        options: [{ value: '111', preselected: true, image: 'https://x/1.jpeg' }, { value: '113' }],
      },
      {
        name: 'BASE',
        required: true,
        options: [
          { value: 'BASE XT/', priceAdjustment: -42.5 },
          { value: 'BASE XC', preselected: true },
        ],
      },
    ]
    expect(getPreselectedVariants(groups)).toEqual([
      { groupName: 'COLOR BASIC', value: '111', priceAdjustment: undefined },
      { groupName: 'BASE', value: 'BASE XC', priceAdjustment: undefined },
    ])
  })

  it('skips groups without a preselected option', () => {
    const groups: VariantGroup[] = [
      { name: 'Izmērs', required: false, options: [{ value: 'M' }, { value: 'L' }] },
    ]
    expect(getPreselectedVariants(groups)).toEqual([])
  })

  it('returns empty array for undefined groups', () => {
    expect(getPreselectedVariants(undefined)).toEqual([])
  })

  it('carries priceAdjustment of the preselected option', () => {
    const groups: VariantGroup[] = [
      { name: 'BASE', required: true, options: [{ value: 'BASE XM', priceAdjustment: 46.04, preselected: true }] },
    ]
    expect(getPreselectedVariants(groups)).toEqual([
      { groupName: 'BASE', value: 'BASE XM', priceAdjustment: 46.04 },
    ])
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

describe('resolveSelectedVariants — checkout re-derives the choice from DB variant groups', () => {
  const specs = {
    __variantGroupsJson: JSON.stringify([
      { name: 'BASE', required: true, options: [{ value: 'XT', priceAdjustment: -42.5 }, { value: 'XM', priceAdjustment: 46.04 }] },
      { name: 'COLOR', required: false, options: [{ value: '111' }] },
    ]),
  }

  it('treats a missing selection as no variants', () => {
    expect(resolveSelectedVariants(specs, undefined)).toEqual([])
    expect(resolveSelectedVariants(null, null)).toEqual([])
  })

  it('keeps an existing option and takes priceAdjustment from the product, not the request', () => {
    expect(resolveSelectedVariants(specs, [
      { groupName: 'BASE', value: 'XM', priceAdjustment: -999 },
      { groupName: 'COLOR', value: '111', priceAdjustment: 5 },
    ])).toEqual([
      { groupName: 'BASE', value: 'XM', priceAdjustment: 46.04 },
      { groupName: 'COLOR', value: '111' },
    ])
  })

  it.each([
    [[{ groupName: 'BASE', value: 'FORGED' }]],
    [[{ groupName: 'NOPE', value: 'XT' }]],
    [[{ groupName: 'BASE', value: 'XT' }, { groupName: 'BASE', value: 'XM' }]],
    ['BASE=XT'],
    [[{ groupName: 'BASE' }]],
  ])('rejects a selection the product does not offer: %j', (requested) => {
    expect(resolveSelectedVariants(specs, requested)).toBeNull()
  })

  it('rejects any selection for a product without variant groups', () => {
    expect(resolveSelectedVariants({}, [{ groupName: 'BASE', value: 'XT' }])).toBeNull()
  })

  it('shape-checks untrusted input without a DB lookup', () => {
    expect(isSelectedVariantsInput(undefined)).toBe(true)
    expect(isSelectedVariantsInput([{ groupName: 'a', value: 'b' }])).toBe(true)
    expect(isSelectedVariantsInput([{ groupName: 'a', value: 1 }])).toBe(false)
    expect(isSelectedVariantsInput([{ groupName: 'a'.repeat(201), value: 'b' }])).toBe(false)
    expect(isSelectedVariantsInput(Array.from({ length: 21 }, () => ({ groupName: 'a', value: 'b' })))).toBe(false)
  })
})
