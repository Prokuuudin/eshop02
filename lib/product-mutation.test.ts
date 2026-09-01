import { describe, expect, it } from 'vitest'
import { hasSkuChanged } from './product-sku'

describe('hasSkuChanged', () => {
  it('treats the same SKU with casing or surrounding whitespace as unchanged', () => {
    expect(hasSkuChanged(' ABC-123 ', 'abc-123')).toBe(false)
  })

  it('detects a genuinely changed or cleared SKU', () => {
    expect(hasSkuChanged('ABC-123', 'XYZ-999')).toBe(true)
    expect(hasSkuChanged('ABC-123', undefined)).toBe(true)
  })
})
