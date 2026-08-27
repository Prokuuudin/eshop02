import { describe, expect, it } from 'vitest'
import type { Order, DeliveryMethod } from '@/lib/orders-store'
import type { CartItem } from '@/lib/cart-store'

// ---------------------------------------------------------------------------
// Pure data transformation helpers that mirror orders-store internal logic.
// We extract and test them directly so that Zustand/localStorage are not
// involved in the unit tests.
// ---------------------------------------------------------------------------

/** Replicates `upsertOrder` merge behaviour */
function upsertInList(orders: Order[], order: Order): Order[] {
  const existingIndex = orders.findIndex(item => item.id === order.id)
  if (existingIndex === -1) {
    return [order, ...orders]
  }
  const next = [...orders]
  next[existingIndex] = { ...next[existingIndex], ...order }
  return next
}

/** Replicates `updateOrderPayment` logic */
function applyPaymentUpdate(
  orders: Order[],
  id: string,
  updates: Partial<Pick<Order, 'paymentStatus' | 'paymentProvider' | 'paymentSessionId'>>
): Order[] {
  return orders.map(order => (order.id === id ? { ...order, ...updates } : order))
}

/** Computes order total from its parts (the formula used at checkout) */
function computeOrderTotal(subtotal: number, delivery: number, tax: number, discount: number): number {
  return subtotal + delivery + tax - discount
}

/** Computes tax amount for a given subtotal and tax rate */
function computeTax(subtotal: number, taxRatePercent: number): number {
  return Math.round((subtotal * taxRatePercent) / 100)
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeItem(id: string, price: number, quantity: number): CartItem {
  return {
    id,
    lineKey: id,
    title: `Product ${id}`,
    brand: 'Brand',
    category: 'hair',
    price,
    quantity,
    image: '',
    rating: 4,
    stock: 100,
    isActive: true
  } as CartItem
}

function makeOrder(overrides: Partial<Order> = {}): Order {
  return {
    id: 'ord-1',
    createdAt: new Date('2024-01-15'),
    items: [makeItem('p1', 500, 2)],
    subtotal: 1000,
    tax: 0,
    delivery: 200,
    deliveryMethod: 'courier' as DeliveryMethod,
    paymentMethod: 'card',
    discount: 0,
    total: 1200,
    firstName: 'Alice',
    lastName: 'Smith',
    email: 'alice@example.com',
    phone: '+1234567890',
    address: '1 Main St',
    city: 'Moscow',
    ...overrides
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('upsertInList (mirrors upsertOrder)', () => {
  it('prepends a new order when id is not found', () => {
    const orders = [makeOrder({ id: 'ord-1' })]
    const newOrder = makeOrder({ id: 'ord-2' })
    const result = upsertInList(orders, newOrder)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('ord-2') // prepended
  })

  it('updates an existing order in place', () => {
    const orders = [makeOrder({ id: 'ord-1', total: 1200 })]
    const updated = makeOrder({ id: 'ord-1', total: 1500 })
    const result = upsertInList(orders, updated)
    expect(result).toHaveLength(1)
    expect(result[0].total).toBe(1500)
  })

  it('merges fields — does not wipe unrelated fields', () => {
    const original = makeOrder({ id: 'ord-1', city: 'Moscow', total: 1200 })
    const partial = makeOrder({ id: 'ord-1', total: 1800 })
    const result = upsertInList([original], partial)
    expect(result[0].city).toBe('Moscow')
    expect(result[0].total).toBe(1800)
  })

  it('keeps other orders unchanged when one is updated', () => {
    const orders = [makeOrder({ id: 'ord-1' }), makeOrder({ id: 'ord-2', total: 999 })]
    const updated = makeOrder({ id: 'ord-1', total: 5000 })
    const result = upsertInList(orders, updated)
    expect(result.find(o => o.id === 'ord-2')?.total).toBe(999)
  })
})

describe('applyPaymentUpdate (mirrors updateOrderPayment)', () => {
  it('updates paymentStatus for the target order', () => {
    const orders = [makeOrder({ id: 'ord-1', paymentStatus: 'unpaid' })]
    const result = applyPaymentUpdate(orders, 'ord-1', { paymentStatus: 'paid' })
    expect(result[0].paymentStatus).toBe('paid')
  })

  it('does not affect other orders', () => {
    const orders = [
      makeOrder({ id: 'ord-1', paymentStatus: 'unpaid' }),
      makeOrder({ id: 'ord-2', paymentStatus: 'unpaid' })
    ]
    const result = applyPaymentUpdate(orders, 'ord-1', { paymentStatus: 'paid' })
    expect(result.find(o => o.id === 'ord-2')?.paymentStatus).toBe('unpaid')
  })

  it('can set paymentProvider and paymentSessionId together', () => {
    const orders = [makeOrder({ id: 'ord-1' })]
    const result = applyPaymentUpdate(orders, 'ord-1', {
      paymentProvider: 'manual',
      paymentSessionId: 'sess_123'
    })
    expect(result[0].paymentProvider).toBe('manual')
    expect(result[0].paymentSessionId).toBe('sess_123')
  })

  it('returns unchanged list when id is not found', () => {
    const orders = [makeOrder({ id: 'ord-1' })]
    const result = applyPaymentUpdate(orders, 'ord-99', { paymentStatus: 'paid' })
    expect(result[0].paymentStatus).toBeUndefined()
  })
})

describe('computeOrderTotal', () => {
  it('adds subtotal, delivery and tax, then subtracts discount', () => {
    expect(computeOrderTotal(1000, 200, 100, 50)).toBe(1250)
  })

  it('returns subtotal + delivery when tax and discount are 0', () => {
    expect(computeOrderTotal(1000, 200, 0, 0)).toBe(1200)
  })

  it('handles zero delivery', () => {
    expect(computeOrderTotal(500, 0, 0, 0)).toBe(500)
  })

  it('handles a discount equal to the full amount', () => {
    expect(computeOrderTotal(1000, 0, 0, 1000)).toBe(0)
  })
})

describe('computeTax', () => {
  it('calculates 20% tax on a round number', () => {
    expect(computeTax(1000, 20)).toBe(200)
  })

  it('rounds fractional tax amounts', () => {
    // 333 * 20 / 100 = 66.6 → rounds to 67
    expect(computeTax(333, 20)).toBe(67)
  })

  it('returns 0 for 0% tax rate', () => {
    expect(computeTax(1000, 0)).toBe(0)
  })

  it('returns 0 for 0 subtotal', () => {
    expect(computeTax(0, 20)).toBe(0)
  })
})
