import { describe, expect, it } from 'vitest'
import type { CartItem } from './cart-store'
import { getCartDrawerSummary } from './cart-drawer-summary'

const item = (lineKey: string, price: number, quantity = 1): CartItem => ({
  id: lineKey,
  lineKey,
  title: lineKey,
  brand: 'Brand',
  price,
  quantity,
  bonusRate: 10,
})

describe('getCartDrawerSummary', () => {
  it('deducts the campaign discount and calculates VAT from the discounted total', () => {
    const summary = getCartDrawerSummary([item('one', 10, 2), item('two', 50)], ['two'], 4)
    expect(summary.subtotal).toBe(20)
    expect(summary.discount).toBe(4)
    expect(summary.finalTotal).toBe(16)
    expect(summary.tax).toBeCloseTo(16 - 16 / 1.21)
    expect(summary.netSubtotal + summary.tax).toBeCloseTo(16)
  })

  it('caps the discount at the selected subtotal and ignores invalid discounts', () => {
    expect(getCartDrawerSummary([item('one', 10)], [], 20).finalTotal).toBe(0)
    expect(getCartDrawerSummary([item('one', 10)], [], Number.NaN).finalTotal).toBe(10)
  })

  it('calculates totals only for selected cart lines', () => {
    const summary = getCartDrawerSummary([item('one', 12, 2), item('two', 50)], ['two'])

    expect(summary.selectedItemIds).toEqual(['one'])
    expect(summary.subtotal).toBe(24)
    expect(summary.finalTotal).toBe(24)
    expect(summary.netSubtotal + summary.tax).toBeCloseTo(24)
    expect(summary.bonusToEarn).toBe(20)
  })

  it('builds an encoded checkout URL for variant line keys', () => {
    const summary = getCartDrawerSummary([item('product::size=L,color=red', 10)], [])

    expect(summary.checkoutHref).toBe('/checkout?items=product%3A%3Asize%3DL%2Ccolor%3Dred')
  })

  it('uses the plain checkout route when nothing is selected', () => {
    const summary = getCartDrawerSummary([item('one', 10)], ['one'])

    expect(summary.checkoutHref).toBe('/checkout')
    expect(summary.subtotal).toBe(0)
  })
})
