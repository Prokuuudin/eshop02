import { describe, expect, it } from 'vitest'
import { mapProductToFormValues, mapFormValuesToProductPatch } from './product-form-mapping'
import type { Product, VariantGroup } from '@/data/products'

const baseProduct: Product = {
  id: 'p1',
  title: 'Test',
  brand: 'B',
  price: 10,
  rating: 0,
  category: 'hair',
  stock: 5,
}

describe('variantGroups round-trip through technicalSpecs', () => {
  it('mapProductToFormValues extracts variantGroups and hides the reserved key from technicalSpecs', () => {
    const groups: VariantGroup[] = [
      { name: 'Krāsu numurs', required: true, options: [{ value: 'A-11' }] },
    ]
    const product: Product = {
      ...baseProduct,
      technicalSpecs: { 'Объём': '50 мл', __variantGroupsJson: JSON.stringify(groups) },
    }
    const values = mapProductToFormValues(product)
    expect(values.variantGroups).toEqual(groups)
    expect(values.technicalSpecs).toEqual([{ key: 'Объём', value: '50 мл' }])
  })

  it('mapFormValuesToProductPatch serializes variantGroups back into technicalSpecs', () => {
    const groups: VariantGroup[] = [
      { name: 'Izmērs', required: false, options: [{ value: 'M' }, { value: 'L', priceAdjustment: 2 }] },
    ]
    const values = mapProductToFormValues({ ...baseProduct, technicalSpecs: { 'Тип': 'крем' } })
    values.variantGroups = groups
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({
      'Тип': 'крем',
      __variantGroupsJson: JSON.stringify(groups),
    })
  })

  it('does not create __variantGroupsJson when there are no variant groups', () => {
    const values = mapProductToFormValues({ ...baseProduct, technicalSpecs: { 'Тип': 'крем' } })
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({ 'Тип': 'крем' })
    expect(patch.technicalSpecs).not.toHaveProperty('__variantGroupsJson')
  })

  it('omits technicalSpecs entirely when there are neither specs nor variant groups', () => {
    const values = mapProductToFormValues({ ...baseProduct, technicalSpecs: undefined })
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toBeUndefined()
  })
})

describe('description translations round-trip through technicalSpecs', () => {
  it('extracts __descriptionEn/Lv into form fields and hides all __ keys from spec rows', () => {
    const product: Product = {
      ...baseProduct,
      technicalSpecs: {
        'Объём': '50 мл',
        __descriptionEn: 'English text',
        __descriptionLv: 'Latvian text',
        __futureReserved: 'x',
      },
    }
    const values = mapProductToFormValues(product)
    expect(values.descriptionEn).toBe('English text')
    expect(values.descriptionLv).toBe('Latvian text')
    expect(values.technicalSpecs).toEqual([{ key: 'Объём', value: '50 мл' }])
    expect(values.reservedTechSpecs).toEqual({ __futureReserved: 'x' })
  })

  it('writes edited description translations and untouched reserved keys back into the patch', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: { 'Тип': 'крем', __descriptionEn: 'Old EN', __futureReserved: 'x' },
    })
    values.descriptionEn = 'New EN'
    values.descriptionLv = 'Jauns LV'
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({
      'Тип': 'крем',
      __futureReserved: 'x',
      __descriptionEn: 'New EN',
      __descriptionLv: 'Jauns LV',
    })
  })

  it('drops __description keys when the admin empties the fields', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: { __descriptionEn: 'EN' },
    })
    values.descriptionEn = ''
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toBeUndefined()
  })
})
