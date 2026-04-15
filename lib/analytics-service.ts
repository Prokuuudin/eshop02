import { useOrders } from '@/lib/orders-store'
import { useInvoicesStore } from '@/lib/invoices-store'
import { PRODUCTS } from '@/data/products'

export interface PurchaseAnalytics {
  totalOrders: number
  totalSpent: number
  averageOrderValue: number
  totalItems: number
  topProducts: Array<{
    productId: string
    productTitle: string
    quantity: number
    revenue: number
  }>
  ordersByMonth: Array<{
    month: string
    count: number
    revenue: number
  }>
  topCategories: Array<{
    category: string
    quantity: number
    revenue: number
  }>
}

export interface CompanyAnalytics extends PurchaseAnalytics {
  companyId: string
  totalInvoices: number
  paidInvoices: number
  overdueInvoices: number
  totalPaymentTermDays: number
  creditUtilization: number // 0-100%
  averagePaymentDaysLate: number
}

/**
 * Get purchase analytics for current user
 */
export function getUserPurchaseAnalytics(): PurchaseAnalytics {
  const orders = useOrders.getState().orders
  
  if (orders.length === 0) {
    return {
      totalOrders: 0,
      totalSpent: 0,
      averageOrderValue: 0,
      totalItems: 0,
      topProducts: [],
      ordersByMonth: [],
      topCategories: []
    }
  }

  // Calculate basic metrics
  const totalSpent = orders.reduce((sum, order) => sum + (order.total || 0), 0)
  const totalItems = orders.reduce((sum, order) => sum + order.items.length, 0)
  const averageOrderValue = totalSpent / orders.length

  // Group orders by product
  const productMap = new Map<string, { quantity: number; revenue: number }>()
  orders.forEach(order => {
    order.items.forEach(item => {
      const existing = productMap.get(item.id) || { quantity: 0, revenue: 0 }
      productMap.set(item.id, {
        quantity: existing.quantity + item.quantity,
        revenue: existing.revenue + (item.price * item.quantity)
      })
    })
  })

  // Top products
  const topProducts = Array.from(productMap.entries())
    .map(([productId, data]) => {
      const product = PRODUCTS.find(p => p.id === productId)
      return {
        productId,
        productTitle: product?.title || 'Unknown',
        quantity: data.quantity,
        revenue: data.revenue
      }
    })
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10)

  // Orders by month
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

  const ordersByMonth = Array.from(monthMap.entries())
    .map(([month, data]) => ({
      month,
      count: data.count,
      revenue: data.revenue
    }))
    .sort((a, b) => new Date(a.month).getTime() - new Date(b.month).getTime())

  // Top categories
  const categoryMap = new Map<string, { quantity: number; revenue: number }>()
  orders.forEach(order => {
    order.items.forEach(item => {
      const product = PRODUCTS.find(p => p.id === item.id)
      if (product) {
        const existing = categoryMap.get(product.category) || { quantity: 0, revenue: 0 }
        categoryMap.set(product.category, {
          quantity: existing.quantity + item.quantity,
          revenue: existing.revenue + (item.price * item.quantity)
        })
      }
    })
  })

  const topCategories = Array.from(categoryMap.entries())
    .map(([category, data]) => ({
      category,
      quantity: data.quantity,
      revenue: data.revenue
    }))
    .sort((a, b) => b.revenue - a.revenue)

  return {
    totalOrders: orders.length,
    totalSpent,
    averageOrderValue,
    totalItems,
    topProducts,
    ordersByMonth,
    topCategories
  }
}

/**
 * Get company analytics (requires company context)
 */
export function getCompanyAnalytics(companyId: string): CompanyAnalytics {
  const purchaseAnalytics = getUserPurchaseAnalytics()
  const invoices = Array.from(useInvoicesStore.getState().invoices.values())
    .filter(inv => inv.companyId === companyId)
  
  const paidInvoices = invoices.filter(inv => inv.status === 'paid').length
  const overdueInvoices = invoices.filter(inv => {
    if (inv.status !== 'issued') return false
    const dueDate = new Date(inv.dueDate)
    return dueDate < new Date()
  }).length
  
  const totalPaymentTermDays = invoices.length > 0
    ? Math.round(invoices.reduce((sum, inv) => {
        const issued = new Date(inv.issuedDate)
        const due = new Date(inv.dueDate)
        return sum + (due.getTime() - issued.getTime()) / (1000 * 60 * 60 * 24)
      }, 0) / invoices.length)
    : 0

  // This would need creditLimit from companyStore
  const creditUtilization = 0 // Placeholder

  // Average payment days late
  const latePayments = invoices
    .filter(inv => inv.status === 'paid' && inv.paidDate)
    .map(inv => {
      const due = new Date(inv.dueDate)
      const paid = new Date(inv.paidDate!)
      return (paid.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)
    })
    .filter(days => days > 0)

  const averagePaymentDaysLate = latePayments.length > 0
    ? Math.round(latePayments.reduce((a, b) => a + b, 0) / latePayments.length)
    : 0

  return {
    ...purchaseAnalytics,
    companyId,
    totalInvoices: invoices.length,
    paidInvoices,
    overdueInvoices,
    totalPaymentTermDays,
    creditUtilization,
    averagePaymentDaysLate
  }
}

/**
 * Get period-based spending analytics
 */
export function getSpendingByPeriod(days: number = 30): {
  period: string
  spending: number
}[] {
  const orders = useOrders.getState().orders
  const now = new Date()
  const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)

  const dayMap = new Map<string, number>()
  
  orders
    .filter(order => new Date(order.createdAt) >= startDate)
    .forEach(order => {
      const date = new Date(order.createdAt)
      const key = date.toLocaleDateString('ru-RU')
      dayMap.set(key, (dayMap.get(key) || 0) + (order.total || 0))
    })

  return Array.from(dayMap.entries())
    .map(([period, spending]) => ({ period, spending }))
    .sort((a, b) => new Date(a.period).getTime() - new Date(b.period).getTime())
}
