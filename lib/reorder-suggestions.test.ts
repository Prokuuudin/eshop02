import { describe, it, expect } from 'vitest'
import type { Order } from './orders-store'
import type { CartItem } from './cart-store'
import { getReorderSuggestions } from './reorder-suggestions'

const NOW = new Date('2026-08-20T00:00:00Z')
const daysAgo = (n: number): Date => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000)

const makeItem = (overrides: Partial<CartItem> & { id: string }): CartItem => ({
  lineKey: overrides.id,
  title: `Product ${overrides.id}`,
  brand: 'BrandA',
  price: 10,
  quantity: 1,
  ...overrides,
})

const makeOrder = (id: string, createdAt: Date, items: CartItem[]): Order =>
  ({
    id,
    createdAt,
    items,
    subtotal: 10,
    tax: 0,
    delivery: 0,
    deliveryMethod: 'courier',
    paymentMethod: 'card',
    discount: 0,
    total: 10,
    firstName: 'A',
    lastName: 'B',
    email: 'a@b.com',
    phone: '',
    address: '',
    city: '',
  } as Order)

describe('getReorderSuggestions', () => {
  it('предлагает товар, купленный ≥3 раз, если прошло ≥80% медианного интервала', () => {
    // покупки раз в ~30 дней, последняя 26 дней назад (0.8*30=24 <= 26)
    const orders = [
      makeOrder('1', daysAgo(86), [makeItem({ id: 'p1' })]),
      makeOrder('2', daysAgo(56), [makeItem({ id: 'p1' })]),
      makeOrder('3', daysAgo(26), [makeItem({ id: 'p1' })]),
    ]
    const result = getReorderSuggestions(orders, NOW)
    expect(result.map((r) => r.item.id)).toEqual(['p1'])
    expect(result[0].medianIntervalDays).toBeCloseTo(30, 0)
  })

  it('не предлагает, если прошло меньше 80% медианного интервала', () => {
    const orders = [
      makeOrder('1', daysAgo(86), [makeItem({ id: 'p1' })]),
      makeOrder('2', daysAgo(56), [makeItem({ id: 'p1' })]),
      makeOrder('3', daysAgo(10), [makeItem({ id: 'p1' })]),
    ]
    expect(getReorderSuggestions(orders, NOW)).toEqual([])
  })

  it('не предлагает товар, купленный меньше 3 раз', () => {
    const orders = [
      makeOrder('1', daysAgo(60), [makeItem({ id: 'p1' })]),
      makeOrder('2', daysAgo(30), [makeItem({ id: 'p1' })]),
    ]
    expect(getReorderSuggestions(orders, NOW)).toEqual([])
  })

  it('берёт снэпшот последнего товара (актуальные title/price/image)', () => {
    const orders = [
      makeOrder('1', daysAgo(86), [makeItem({ id: 'p1', price: 8, title: 'Old title' })]),
      makeOrder('2', daysAgo(56), [makeItem({ id: 'p1', price: 9, title: 'Old title' })]),
      makeOrder('3', daysAgo(26), [makeItem({ id: 'p1', price: 11, title: 'New title' })]),
    ]
    const result = getReorderSuggestions(orders, NOW)
    expect(result[0].item.price).toBe(11)
    expect(result[0].item.title).toBe('New title')
  })

  it('сортирует по срочности (наибольшее превышение медианного интервала первым)', () => {
    const orders = [
      // p1: интервал 30, последняя покупка 26 дней назад → ratio ~0.87
      makeOrder('1', daysAgo(86), [makeItem({ id: 'p1' })]),
      makeOrder('2', daysAgo(56), [makeItem({ id: 'p1' })]),
      makeOrder('3', daysAgo(26), [makeItem({ id: 'p1' })]),
      // p2: интервал 20, последняя покупка 25 дней назад → ratio 1.25 (более срочный)
      makeOrder('4', daysAgo(65), [makeItem({ id: 'p2' })]),
      makeOrder('5', daysAgo(45), [makeItem({ id: 'p2' })]),
      makeOrder('6', daysAgo(25), [makeItem({ id: 'p2' })]),
    ]
    const result = getReorderSuggestions(orders, NOW)
    expect(result.map((r) => r.item.id)).toEqual(['p2', 'p1'])
  })

  it('ограничивает результат max', () => {
    const orders: Order[] = []
    for (let p = 1; p <= 6; p++) {
      const id = `p${p}`
      orders.push(makeOrder(`${id}-1`, daysAgo(86), [makeItem({ id })]))
      orders.push(makeOrder(`${id}-2`, daysAgo(56), [makeItem({ id })]))
      orders.push(makeOrder(`${id}-3`, daysAgo(26), [makeItem({ id })]))
    }
    expect(getReorderSuggestions(orders, NOW, 4)).toHaveLength(4)
  })

  it('игнорирует товары с нулевым медианным интервалом (все покупки в один день)', () => {
    const sameDay = daysAgo(5)
    const orders = [
      makeOrder('1', sameDay, [makeItem({ id: 'p1' })]),
      makeOrder('2', sameDay, [makeItem({ id: 'p1' })]),
      makeOrder('3', sameDay, [makeItem({ id: 'p1' })]),
    ]
    expect(getReorderSuggestions(orders, NOW)).toEqual([])
  })
})
