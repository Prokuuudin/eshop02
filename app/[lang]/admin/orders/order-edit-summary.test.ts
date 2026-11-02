import { describe, expect, it } from 'vitest'
import { willRecalculateSecondItemDiscount } from './order-edit-summary'

const order = (items: unknown[]) => ({ items }) as never
const edit = (id: string, quantity: number) => ({ id, lineKey: id, title: id, price: 10, quantity })

describe('willRecalculateSecondItemDiscount', () => {
  const promoted = [{ id: 'a', quantity: 2, price: 10, promotionId: 'kemon-2nd', promotionDiscount: 5 }]

  it('flags line changes on an order with a second-item split', () => {
    expect(willRecalculateSecondItemDiscount(order(promoted), [edit('a', 1)])).toBe(true)
    expect(willRecalculateSecondItemDiscount(order(promoted), [edit('a', 2), edit('b', 1)])).toBe(true)
  })

  it('stays quiet for unchanged lines and for orders without a split', () => {
    expect(willRecalculateSecondItemDiscount(order(promoted), [edit('a', 2)])).toBe(false)
    expect(willRecalculateSecondItemDiscount(order([{ id: 'a', quantity: 2, price: 10 }]), [edit('a', 1)])).toBe(false)
  })
})
