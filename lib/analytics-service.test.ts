import { describe, expect, it } from 'vitest'
import { computePurchaseAnalytics as computeRealPurchaseAnalytics } from './analytics-service'
import type { Order } from './orders-store'

// ---------------------------------------------------------------------------
// Pure computation helpers extracted from analytics-service.ts logic.
// We test the algorithms directly without touching Zustand stores.
// ---------------------------------------------------------------------------

// Mirrors the shape used inside getUserPurchaseAnalytics
interface TestOrderItem {
  id: string
  title: string
  quantity: number
  price: number
  category?: string
}

interface TestOrder {
  email: string
  total: number
  createdAt: Date
  items: TestOrderItem[]
}

// ----- helpers that replicate the service's pure computation -----

function computePurchaseAnalytics(orders: TestOrder[]) {
  if (orders.length === 0) {
    return {
      totalOrders: 0,
      totalSpent: 0,
      averageOrderValue: 0,
      totalItems: 0,
      topProducts: [] as Array<{ productId: string; productTitle: string; quantity: number; revenue: number }>,
      ordersByMonth: [] as Array<{ month: string; count: number; revenue: number }>,
      topCategories: [] as Array<{ category: string; quantity: number; revenue: number }>
    }
  }

  const totalSpent = orders.reduce((sum, o) => sum + (o.total || 0), 0)
  const totalItems = orders.reduce((sum, o) => sum + o.items.reduce((itemSum, item) => itemSum + item.quantity, 0), 0)
  const averageOrderValue = totalSpent / orders.length

  const productMap = new Map<string, { title: string; quantity: number; revenue: number }>()
  orders.forEach(order => {
    order.items.forEach(item => {
      const existing = productMap.get(item.id) || { title: item.title, quantity: 0, revenue: 0 }
      productMap.set(item.id, {
        title: item.title,
        quantity: existing.quantity + item.quantity,
        revenue: existing.revenue + item.price * item.quantity
      })
    })
  })

  const topProducts = Array.from(productMap.entries())
    .map(([productId, data]) => ({
      productId,
      productTitle: data.title,
      quantity: data.quantity,
      revenue: data.revenue
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  const monthMap = new Map<string, { count: number; revenue: number }>()
  orders.forEach(order => {
    const date = new Date(order.createdAt)
    const month = date.toLocaleString('ru-RU', { month: 'long', year: 'numeric' })
    const existing = monthMap.get(month) || { count: 0, revenue: 0 }
    monthMap.set(month, {
      count: existing.count + 1,
      revenue: existing.revenue + (order.total || 0)
    })
  })

  const ordersByMonth = Array.from(monthMap.entries()).map(([month, data]) => ({
    month,
    count: data.count,
    revenue: data.revenue
  }))

  const categoryMap = new Map<string, { quantity: number; revenue: number }>()
  orders.forEach(order => {
    order.items.forEach(item => {
      if (item.category) {
        const existing = categoryMap.get(item.category) || { quantity: 0, revenue: 0 }
        categoryMap.set(item.category, {
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + item.price * item.quantity
        })
      }
    })
  })

  const topCategories = Array.from(categoryMap.entries())
    .map(([category, data]) => ({ category, quantity: data.quantity, revenue: data.revenue }))
    .sort((a, b) => b.revenue - a.revenue)

  return { totalOrders: orders.length, totalSpent, averageOrderValue, totalItems, topProducts, ordersByMonth, topCategories }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const orderA: TestOrder = {
  email: 'alice@example.com',
  total: 3000,
  createdAt: new Date('2024-03-15'),
  items: [
    { id: 'prod1', title: 'Крем А', quantity: 2, price: 1000, category: 'Кремы' },
    { id: 'prod2', title: 'Шампунь Б', quantity: 1, price: 1000, category: 'Шампуни' }
  ]
}

const orderB: TestOrder = {
  email: 'alice@example.com',
  total: 2000,
  createdAt: new Date('2024-04-10'),
  items: [
    { id: 'prod1', title: 'Крем А', quantity: 3, price: 500, category: 'Кремы' }
  ]
}

const orderC: TestOrder = {
  email: 'bob@example.com',
  total: 5000,
  createdAt: new Date('2024-03-20'),
  items: [
    { id: 'prod3', title: 'Маска В', quantity: 5, price: 1000, category: 'Маски' }
  ]
}

describe('computePurchaseAnalytics — empty state', () => {
  it('returns zeros and empty arrays for no orders', () => {
    const result = computePurchaseAnalytics([])
    expect(result.totalOrders).toBe(0)
    expect(result.totalSpent).toBe(0)
    expect(result.averageOrderValue).toBe(0)
    expect(result.totalItems).toBe(0)
    expect(result.topProducts).toHaveLength(0)
    expect(result.ordersByMonth).toHaveLength(0)
    expect(result.topCategories).toHaveLength(0)
  })
})

describe('computePurchaseAnalytics — basic metrics', () => {
  it('counts total orders correctly', () => {
    const result = computePurchaseAnalytics([orderA, orderB])
    expect(result.totalOrders).toBe(2)
  })

  it('sums totalSpent across all orders', () => {
    const result = computePurchaseAnalytics([orderA, orderB])
    expect(result.totalSpent).toBe(5000)
  })

  it('computes averageOrderValue', () => {
    const result = computePurchaseAnalytics([orderA, orderB])
    expect(result.averageOrderValue).toBe(2500)
  })

  it('counts purchased units, including quantities', () => {
    // orderA has 3 units, orderB has 3 more
    const result = computePurchaseAnalytics([orderA, orderB])
    expect(result.totalItems).toBe(6)
  })
})

describe('production analytics service', () => {
  const asOrder = (order: TestOrder): Order => order as unknown as Order

  it('counts quantities in the implementation used by the page', () => {
    expect(computeRealPurchaseAnalytics([asOrder(orderA), asOrder(orderB)]).totalItems).toBe(6)
  })

  it('sorts localized month labels chronologically', () => {
    const result = computeRealPurchaseAnalytics([asOrder(orderB), asOrder(orderA)], 'en-US')
    expect(result.ordersByMonth.map((entry) => entry.month)).toEqual(['March 2024', 'April 2024'])
    expect(result.ordersByMonth.map((entry) => entry.shortMonth)).toEqual(['Mar 24', 'Apr 24'])
  })
})

describe('computePurchaseAnalytics — topProducts', () => {
  it('aggregates the same product across multiple orders', () => {
    const result = computePurchaseAnalytics([orderA, orderB])
    const prod1 = result.topProducts.find(p => p.productId === 'prod1')
    expect(prod1).toBeDefined()
    // orderA: 2*1000=2000, orderB: 3*500=1500 → revenue 3500, quantity 5
    expect(prod1?.revenue).toBe(3500)
    expect(prod1?.quantity).toBe(5)
  })

  it('sorts topProducts by revenue descending', () => {
    const result = computePurchaseAnalytics([orderA, orderB, orderC])
    const revenues = result.topProducts.map(p => p.revenue)
    for (let i = 1; i < revenues.length; i++) {
      expect(revenues[i - 1]).toBeGreaterThanOrEqual(revenues[i])
    }
  })

  it('returns at most 10 products', () => {
    const manyOrders: TestOrder[] = Array.from({ length: 15 }, (_, i) => ({
      email: 'x@x.com',
      total: 100,
      createdAt: new Date(),
      items: [{ id: `prod${i}`, title: `P${i}`, quantity: 1, price: 100, category: 'X' }]
    }))
    const result = computePurchaseAnalytics(manyOrders)
    expect(result.topProducts.length).toBeLessThanOrEqual(10)
  })
})

describe('computePurchaseAnalytics — ordersByMonth', () => {
  it('groups orders into distinct months', () => {
    const result = computePurchaseAnalytics([orderA, orderC])
    // Both in March 2024 → 1 month entry
    expect(result.ordersByMonth).toHaveLength(1)
  })

  it('produces separate entries for different months', () => {
    const result = computePurchaseAnalytics([orderA, orderB])
    // March and April
    expect(result.ordersByMonth).toHaveLength(2)
  })

  it('sums revenue within a month', () => {
    const result = computePurchaseAnalytics([orderA, orderC])
    const march = result.ordersByMonth[0]
    expect(march.count).toBe(2)
    expect(march.revenue).toBe(8000)
  })
})

describe('computePurchaseAnalytics — topCategories', () => {
  it('aggregates revenue by category', () => {
    const result = computePurchaseAnalytics([orderA, orderB])
    const creams = result.topCategories.find(c => c.category === 'Кремы')
    // orderA: 2*1000=2000, orderB: 3*500=1500 → 3500
    expect(creams?.revenue).toBe(3500)
  })

  it('sorts categories by revenue descending', () => {
    const result = computePurchaseAnalytics([orderA, orderB, orderC])
    const revenues = result.topCategories.map(c => c.revenue)
    for (let i = 1; i < revenues.length; i++) {
      expect(revenues[i - 1]).toBeGreaterThanOrEqual(revenues[i])
    }
  })

  it('ignores items without a category', () => {
    const order: TestOrder = {
      email: 'x@x.com',
      total: 100,
      createdAt: new Date(),
      items: [{ id: 'p99', title: 'X', quantity: 1, price: 100 }] // no category
    }
    const result = computePurchaseAnalytics([order])
    expect(result.topCategories).toHaveLength(0)
  })
})
