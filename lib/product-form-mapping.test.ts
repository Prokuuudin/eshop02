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
  it('uses null to explicitly clear an old price in an update', () => {
    const values = mapProductToFormValues({ ...baseProduct, oldPrice: 15 })
    values.oldPrice = undefined
    expect(mapFormValuesToProductPatch(values).oldPrice).toBeNull()
  })

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

  it('round-trips image, preselected and displayType fields', () => {
    const groups: VariantGroup[] = [
      {
        name: 'COLOR BASIC',
        required: true,
        displayType: 'imageSquares',
        options: [
          { value: '111', image: 'https://hairshop.lv/content/images/thumbs/0021552.jpeg', preselected: true },
          { value: '113', image: 'https://hairshop.lv/content/images/thumbs/0021553.jpeg' },
        ],
      },
      {
        name: 'BASE',
        required: true,
        displayType: 'imageSquares',
        options: [{ value: 'BASE XM', priceAdjustment: 46.04 }],
      },
    ]
    const product: Product = {
      ...baseProduct,
      technicalSpecs: { __variantGroupsJson: JSON.stringify(groups) },
    }
    const values = mapProductToFormValues(product)
    expect(values.variantGroups).toEqual(groups)
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({ __variantGroupsJson: JSON.stringify(groups) })
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

describe('visibility (status ↔ isActive)', () => {
  it('maps isActive=false to status "hidden" and back', () => {
    const values = mapProductToFormValues({ ...baseProduct, isActive: false })
    expect(values.status).toBe('hidden')
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.isActive).toBe(false)
  })

  it('defaults to "active" when isActive is unset and writes true', () => {
    const values = mapProductToFormValues(baseProduct)
    expect(values.status).toBe('active')
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.isActive).toBe(true)
  })
})

describe('minOrder ↔ minOrderQuantities', () => {
  it('loads the minimum of existing quantities into the form', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      minOrderQuantities: { retail: 5, wholesale: 10 },
    })
    expect(values.minOrder).toBe(5)
  })

  it('writes minOrder > 1 as the default quantity', () => {
    const values = mapProductToFormValues(baseProduct)
    values.minOrder = 6
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.minOrderQuantities).toEqual({ default: 6 })
  })

  it('clears quantities with an empty record when minOrder is 1', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      minOrderQuantities: { default: 4 },
    })
    values.minOrder = 1
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.minOrderQuantities).toEqual({})
  })
})

describe('demoVideo', () => {
  it('drops rows without src and strips empty posters', () => {
    const values = mapProductToFormValues(baseProduct)
    values.demoVideo = [
      { src: ' https://cdn/x.mp4 ', poster: '' },
      { src: '', poster: 'https://cdn/p.jpg' },
    ]
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.demoVideo).toEqual([{ src: 'https://cdn/x.mp4' }])
  })

  it('sends an empty array so clearing the last video reaches the DB', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      demoVideo: [{ src: 'https://cdn/x.mp4' }],
    })
    values.demoVideo = []
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.demoVideo).toEqual([])
  })
})

describe('related products and bought-together lists', () => {
  it('round-trips ids and drops blank entries', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      relatedProductIds: ['13128', '13132'],
      oftenBoughtTogether: ['13126'],
    })
    values.relatedProductIds = ['13128', ' ', '13132']
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.relatedProductIds).toEqual(['13128', '13132'])
    expect(patch.oftenBoughtTogether).toEqual(['13126'])
  })

  it('sends empty arrays so clearing the lists reaches the DB and re-enables auto-fill', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      relatedProductIds: ['13128'],
      oftenBoughtTogether: ['13126'],
    })
    values.relatedProductIds = []
    values.oftenBoughtTogether = []
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.relatedProductIds).toEqual([])
    expect(patch.oftenBoughtTogether).toEqual([])
  })
})

describe('spec translations: no dedicated fields, round-trip untouched via reservedTechSpecs', () => {
  it('passes __spec*En/Lv through reservedTechSpecs since there is no admin UI for them anymore', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: {
        __specVolumeEn: '250 ml',
        __specTypeLv: 'Profesionāls',
        __futureReserved: 'x',
      },
    })
    expect(values.reservedTechSpecs).toEqual({
      __specVolumeEn: '250 ml',
      __specTypeLv: 'Profesionāls',
      __futureReserved: 'x',
    })
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({
      __specVolumeEn: '250 ml',
      __specTypeLv: 'Profesionāls',
      __futureReserved: 'x',
    })
  })
})

describe('application/warnings round-trip through technicalSpecs', () => {
  it('extracts __application/__warnings (+translations) into form fields', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: {
        __application: 'Нанести на волосы',
        __applicationEn: 'Apply to hair',
        __warnings: 'Избегать попадания в глаза',
        __futureReserved: 'x',
      },
    })
    expect(values.application).toBe('Нанести на волосы')
    expect(values.applicationEn).toBe('Apply to hair')
    expect(values.warnings).toBe('Избегать попадания в глаза')
    expect(values.reservedTechSpecs).toEqual({ __futureReserved: 'x' })
  })

  it('writes edited application/warnings back into the patch', () => {
    const values = mapProductToFormValues({ ...baseProduct, technicalSpecs: { 'Тип': 'крем' } })
    values.application = 'Нанести, смыть через 5 минут'
    values.warningsLv = 'Tikai ārīgai lietošanai'
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({
      'Тип': 'крем',
      __application: 'Нанести, смыть через 5 минут',
      __warningsLv: 'Tikai ārīgai lietošanai',
    })
  })

  it('drops the keys when the admin empties the fields', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: { __application: 'x', __warnings: 'y' },
    })
    values.application = ''
    values.warnings = ''
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toBeUndefined()
  })
})

describe('ingredients round-trip through technicalSpecs', () => {
  it('extracts the ingredient key into the form field and hides it from spec rows', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: { 'Объём': '50 мл', INGREDIENTS: 'Aqua;Glycerin' },
    })
    expect(values.ingredients).toBe('Aqua;Glycerin')
    expect(values.ingredientsKey).toBe('INGREDIENTS')
    expect(values.technicalSpecs).toEqual([{ key: 'Объём', value: '50 мл' }])
  })

  it('preserves the original ingredient label key on save', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: { 'Sastāvs': 'Aqua;Parfum' },
    })
    values.ingredients = 'Aqua;Parfum;Glycerin'
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({ 'Sastāvs': 'Aqua;Parfum;Glycerin' })
  })

  it('writes new ingredients under INGREDIENTS when the product had none', () => {
    const values = mapProductToFormValues({ ...baseProduct })
    values.ingredients = 'Aqua'
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toEqual({ INGREDIENTS: 'Aqua' })
  })

  it('drops the ingredient key when the admin empties the field', () => {
    const values = mapProductToFormValues({
      ...baseProduct,
      technicalSpecs: { INGREDIENTS: 'Aqua' },
    })
    values.ingredients = ''
    const patch = mapFormValuesToProductPatch(values)
    expect(patch.technicalSpecs).toBeUndefined()
  })
})
