import { describe, expect, it } from 'vitest'
import { mapProductToFormValues, mapFormValuesToProductPatch, mapChangedFormValuesToProductPatch } from './product-form-mapping'
import type { Product, VariantGroup } from '@/data/products'
import { updateProductRequestSchema } from './product-mutation-schema'

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

import type { AddProductFormValues } from '@/components/admin/products/productFormSchema'

const values = {
  id: 'p1', sku: '', barcode: '', brand: 'Brand', category: 'hair', status: 'active',
  title: 'Product', titleEn: '', titleLv: '', description: '', descriptionEn: '', descriptionLv: '',
  ingredients: '', ingredientsKey: 'INGREDIENTS', application: '', applicationEn: '', applicationLv: '',
  warnings: '', warningsEn: '', warningsLv: '', price: 10, oldPrice: 0, bulkPricingTiers: [],
  stock: 1, minOrder: 1, image: '', images: [], badges: [], technicalSpecs: [], reservedTechSpecs: {},
  variantGroups: [], compatibleEquipment: [], certificates: [], relatedProductIds: [], oftenBoughtTogether: [],
  demoVideo: [], metaTitle: '', metaDescription: '', ogImage: '', ogAlt: '', manufacturerName: '',
  manufacturerAddress: '', manufacturerEmail: '', distributorName: { ru: '', en: '', lv: '' },
  distributorAddress: { ru: '', en: '', lv: '' }, distributorEmail: '', bonusRate: undefined,
  rating: undefined, feature1: '', feature1En: '', feature1Lv: '', feature2: '', feature2En: '',
  feature2Lv: '', feature3: '', feature3En: '', feature3Lv: '', feature4: '', feature4En: '', feature4Lv: '',
} satisfies AddProductFormValues

describe('mapChangedFormValuesToProductPatch', () => {
  it('sends only the changed price from an otherwise unchanged product', () => {
    expect(mapChangedFormValuesToProductPatch({ ...values, price: 12.5 }, values)).toEqual({ price: 12.5 })
  })

  it('returns an empty patch for an unchanged form', () => {
    expect(mapChangedFormValuesToProductPatch({ ...values }, values)).toEqual({})
  })
})

describe('changed-only PATCH: explicit clears survive JSON transport', () => {
  type FormValues = ReturnType<typeof mapProductToFormValues>

  // What the browser actually sends: undefined-valued keys disappear here.
  const overTheWire = (changes: object): Record<string, unknown> => JSON.parse(JSON.stringify(changes))
  const parseUpdate = (changes: object) =>
    updateProductRequestSchema.safeParse({ id: 'p1', revision: 1, changes: overTheWire(changes) })

  const filledProduct: Product = {
    ...baseProduct,
    sku: 'SKU-1', barcode: '4750000000001', titleEn: 'English title', titleLv: 'Latviešu nosaukums',
    description: 'Описание', image: '/img/main.jpg', images: ['/img/a.jpg'], badges: ['new'],
    metaTitle: 'Meta', metaDescription: 'Meta description', ogImage: '/img/og.jpg', ogAlt: 'Alt',
    manufacturerName: 'Maker', manufacturerAddress: 'Riga', manufacturerEmail: 'maker@example.com',
    distributorName: { ru: 'Дистрибьютор', en: '', lv: '' }, distributorAddress: { ru: '', en: 'Street 1', lv: '' },
    distributorEmail: 'dist@example.com', compatibleEquipment: ['Dryer'], certificates: ['/cert.pdf'],
    bulkPricingTiers: [{ quantity: 10, pricePerUnit: 9 }], feature1: 'Feature', feature4Lv: 'Iezīme',
    technicalSpecs: { 'Тип': 'крем' },
  }

  const clearable: Array<[string, (values: FormValues) => void, string, unknown]> = [
    ['titleEn', (v) => { v.titleEn = '' }, 'titleEn', ''],
    ['titleLv', (v) => { v.titleLv = '' }, 'titleLv', ''],
    ['description', (v) => { v.description = '' }, 'description', ''],
    ['sku', (v) => { v.sku = '' }, 'sku', ''],
    ['barcode', (v) => { v.barcode = '' }, 'barcode', ''],
    ['image', (v) => { v.image = '' }, 'image', ''],
    ['metaTitle', (v) => { v.metaTitle = '' }, 'metaTitle', ''],
    ['metaDescription', (v) => { v.metaDescription = '' }, 'metaDescription', ''],
    ['ogImage', (v) => { v.ogImage = '' }, 'ogImage', ''],
    ['ogAlt', (v) => { v.ogAlt = '' }, 'ogAlt', ''],
    ['manufacturerName', (v) => { v.manufacturerName = '' }, 'manufacturerName', ''],
    ['manufacturerAddress', (v) => { v.manufacturerAddress = '' }, 'manufacturerAddress', ''],
    ['feature1', (v) => { v.feature1 = '' }, 'feature1', ''],
    ['feature4Lv', (v) => { v.feature4Lv = '' }, 'feature4Lv', ''],
    ['images', (v) => { v.images = [] }, 'images', []],
    ['badges', (v) => { v.badges = [] }, 'badges', []],
    ['compatibleEquipment', (v) => { v.compatibleEquipment = [] }, 'compatibleEquipment', []],
    ['certificates', (v) => { v.certificates = [] }, 'certificates', []],
    ['bulkPricingTiers', (v) => { v.bulkPricingTiers = [] }, 'bulkPricingTiers', []],
    ['technicalSpecs rows', (v) => { v.technicalSpecs = [] }, 'technicalSpecs', {}],
    ['distributorName', (v) => { v.distributorName = { ru: '', en: '', lv: '' } }, 'distributorName', { ru: '', en: '', lv: '' }],
    ['distributorAddress', (v) => { v.distributorAddress = { ru: '', en: '', lv: '' } }, 'distributorAddress', { ru: '', en: '', lv: '' }],
  ]

  it.each(clearable)('keeps a cleared %s in the serialized request as an explicit clear', (_label, clear, key, cleared) => {
    const initial = mapProductToFormValues(filledProduct)
    const values = structuredClone(initial)
    clear(values)

    const wire = overTheWire(mapChangedFormValuesToProductPatch(values, initial))

    expect(wire).toEqual({ [key]: cleared })
    const parsed = parseUpdate(wire)
    expect(parsed.success).toBe(true)
    expect(parsed.data?.changes).toEqual({ [key]: cleared })
  })

  it('clears translated descriptions stored inside technicalSpecs with an empty specs object', () => {
    const initial = mapProductToFormValues({ ...baseProduct, technicalSpecs: { __descriptionEn: 'EN text' } })
    const values = { ...initial, descriptionEn: '' }

    const wire = overTheWire(mapChangedFormValuesToProductPatch(values, initial))

    expect(wire).toEqual({ technicalSpecs: {} })
    expect(parseUpdate(wire).success).toBe(true)
  })

  it('sends only the cleared field when other fields are untouched', () => {
    const initial = mapProductToFormValues(filledProduct)
    const wire = overTheWire(mapChangedFormValuesToProductPatch({ ...initial, titleEn: '' }, initial))
    expect(Object.keys(wire)).toEqual(['titleEn'])
  })

  it('never reports a change that JSON transport would drop', () => {
    const initial = mapProductToFormValues(filledProduct)
    for (const [, clear] of clearable) {
      const values = structuredClone(initial)
      clear(values)
      const changes = mapChangedFormValuesToProductPatch(values, initial)
      expect(Object.keys(overTheWire(changes))).toEqual(Object.keys(changes))
    }
  })

  it('does not send fields that were empty before and are still empty', () => {
    const initial = mapProductToFormValues(baseProduct)
    expect(mapChangedFormValuesToProductPatch({ ...initial, titleEn: '', images: [], technicalSpecs: [] }, initial)).toEqual({})
  })

  it('keeps zero and false as real values', () => {
    const initial = mapProductToFormValues(baseProduct)
    const wire = overTheWire(mapChangedFormValuesToProductPatch({ ...initial, price: 0, stock: 0, status: 'hidden' }, initial))
    expect(wire).toEqual({ price: 0, stock: 0, isActive: false })
    expect(parseUpdate(wire).success).toBe(true)
  })

  it('clears an old price with null, the existing update marker', () => {
    const initial = mapProductToFormValues({ ...baseProduct, oldPrice: 15 })
    const wire = overTheWire(mapChangedFormValuesToProductPatch({ ...initial, oldPrice: undefined }, initial))
    expect(wire).toEqual({ oldPrice: null })
    expect(parseUpdate(wire).success).toBe(true)
  })

  it('sends whitespace-only input, which the server trims to an explicit clear', () => {
    const initial = mapProductToFormValues(filledProduct)
    const parsed = parseUpdate(mapChangedFormValuesToProductPatch({ ...initial, titleEn: '   ' }, initial))
    expect(parsed.success).toBe(true)
    expect(parsed.data?.changes).toEqual({ titleEn: '' })
  })

  it.each(['manufacturerEmail', 'distributorEmail'] as const)(
    'sends a cleared %s explicitly; the current server contract rejects an empty email instead of ignoring it',
    (key) => {
      const initial = mapProductToFormValues(filledProduct)
      const wire = overTheWire(mapChangedFormValuesToProductPatch({ ...initial, [key]: '' }, initial))
      expect(wire).toEqual({ [key]: '' })
      expect(parseUpdate(wire).success).toBe(false)
    },
  )
})
