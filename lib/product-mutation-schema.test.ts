import { describe, expect, it } from 'vitest'
import { createProductRequestSchema, updateProductRequestSchema } from './product-mutation-schema'

const valid = { id: 'SKU-1', title: 'Product', brand: 'Brand', category: 'hair', price: 10, stock: 5 }

describe('product mutation schemas', () => {
  it('rejects negative money and inventory', () => {
    expect(createProductRequestSchema.safeParse({ product: { ...valid, price: -1 } }).success).toBe(false)
    expect(createProductRequestSchema.safeParse({ product: { ...valid, stock: -1 } }).success).toBe(false)
  })

  it('requires an optimistic concurrency revision', () => {
    expect(updateProductRequestSchema.safeParse({ id: valid.id, changes: { price: 9 } }).success).toBe(false)
    expect(updateProductRequestSchema.safeParse({ id: valid.id, revision: 2, changes: { price: 9 } }).success).toBe(true)
  })

  it('allows clearing an old price during an exact rollback', () => {
    expect(updateProductRequestSchema.safeParse({ id: valid.id, revision: 2, changes: { oldPrice: null } }).success).toBe(true)
  })

  it('rejects unknown fields and invalid bulk tiers', () => {
    expect(updateProductRequestSchema.safeParse({ id: valid.id, revision: 1, changes: { hacked: true } }).success).toBe(false)
    expect(updateProductRequestSchema.safeParse({ id: valid.id, revision: 1, changes: { bulkPricingTiers: [
      { quantity: 10, pricePerUnit: 8 }, { quantity: 5, pricePerUnit: 9 },
    ] } }).success).toBe(false)
  })

  it('rejects duplicate related IDs and excessive lengths', () => {
    expect(updateProductRequestSchema.safeParse({ id: valid.id, revision: 1, changes: { relatedProductIds: ['P2', 'P2'] } }).success).toBe(false)
    expect(updateProductRequestSchema.safeParse({ id: valid.id, revision: 1, changes: { title: 'x'.repeat(301) } }).success).toBe(false)
  })
})
