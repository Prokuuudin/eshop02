import { describe, expect, it } from 'vitest'
import { addProductSchema } from '@/components/admin/products/productFormSchema'

// Minimal valid payload for addProductSchema, used as a base so each test
// only needs to vary the field under test (variantGroups.options.priceAdjustment).
function baseProduct(variantGroups: unknown[] = []) {
  return {
    id: 'p1',
    brand: 'Acme',
    category: 'hair',
    status: 'active' as const,
    title: 'Тестовый товар',
    price: 9.99,
    bulkPricingTiers: [],
    stock: 10,
    minOrder: 1,
    images: [],
    badges: [],
    technicalSpecs: [],
    variantGroups,
    compatibleEquipment: [],
    certificates: [],
    relatedProductIds: [],
    oftenBoughtTogether: [],
    demoVideo: [],
  }
}

describe('addProductSchema variantGroups.options.priceAdjustment', () => {
  it('resolves NaN (react-hook-form valueAsNumber on an empty input) to undefined and still passes validation', () => {
    const payload = baseProduct([
      {
        name: 'Krāsu numurs',
        required: false,
        options: [{ value: 'A-11', priceAdjustment: NaN }],
      },
    ])

    const result = addProductSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.variantGroups[0].options[0].priceAdjustment).toBeUndefined()
    }
  })

  it('passes a real number through unchanged', () => {
    const payload = baseProduct([
      {
        name: 'Krāsu numurs',
        required: false,
        options: [{ value: 'A-11', priceAdjustment: 5.5 }],
      },
    ])

    const result = addProductSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.variantGroups[0].options[0].priceAdjustment).toBe(5.5)
    }
  })

  it('still passes when priceAdjustment is omitted entirely', () => {
    const payload = baseProduct([
      {
        name: 'Krāsu numurs',
        required: false,
        options: [{ value: 'A-11' }],
      },
    ])

    const result = addProductSchema.safeParse(payload)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.variantGroups[0].options[0].priceAdjustment).toBeUndefined()
    }
  })
})
