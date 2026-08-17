import { useOrders } from '@/lib/orders-store'
import { useInvoicesStore } from '@/lib/invoices-store'

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
    shortMonth: string
    count: number
    revenue: number
  }>
  topCategories: Array<{
    category: string
    quantity: number
    revenue: number
  }>
}

const emptyPurchaseAnalytics = (): PurchaseAnalytics => ({
  totalOrders: 0,
  totalSpent: 0,
  averageOrderValue: 0,
  totalItems: 0,
  topProducts: [],
  ordersByMonth: [],
  topCategories: []
})

export function computePurchaseAnalytics(
  orders: ReturnType<typeof useOrders.getState>['orders'],
  locale = 'ru-RU'
): PurchaseAnalytics {
  if (orders.length === 0) return emptyPurchaseAnalytics()

  const totalSpent = orders.reduce((sum, order) => sum + (order.total || 0), 0)
  const totalItems = orders.reduce(
    (sum, order) => sum + order.items.reduce((itemSum, item) => itemSum + item.quantity, 0),
    0
  )
  const averageOrderValue = totalSpent / orders.length

  const productMap = new Map<string, { title: string; quantity: number; revenue: number }>()
  const categoryMap = new Map<string, { quantity: number; revenue: number }>()
  const monthMap = new Map<string, { label: string; shortLabel: string; count: number; revenue: number }>()

  orders.forEach((order) => {
    order.items.forEach((item) => {
      const product = productMap.get(item.id) || { title: item.title, quantity: 0, revenue: 0 }
      productMap.set(item.id, {
        title: item.title,
        quantity: product.quantity + item.quantity,
        revenue: product.revenue + item.price * item.quantity
      })

      if (item.category) {
        const category = categoryMap.get(item.category) || { quantity: 0, revenue: 0 }
        categoryMap.set(item.category, {
          quantity: category.quantity + item.quantity,
          revenue: category.revenue + item.price * item.quantity
        })
      }
    })

    const date = new Date(order.createdAt)
    if (!Number.isNaN(date.getTime())) {
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const month = monthMap.get(key) || {
        label: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(date),
        shortLabel: new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(date),
        count: 0,
        revenue: 0
      }
      monthMap.set(key, {
        ...month,
        count: month.count + 1,
        revenue: month.revenue + (order.total || 0)
      })
    }
  })

  return {
    totalOrders: orders.length,
    totalSpent,
    averageOrderValue,
    totalItems,
    topProducts: Array.from(productMap.entries())
      .map(([productId, data]) => ({ productId, productTitle: data.title, ...data }))
      .sort((a, b) => b.revenue - a.revenue),
    ordersByMonth: Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, data]) => ({ month: data.label, shortMonth: data.shortLabel, count: data.count, revenue: data.revenue })),
    topCategories: Array.from(categoryMap.entries())
      .map(([category, data]) => ({ category, ...data }))
      .sort((a, b) => b.revenue - a.revenue)
  }
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
 * Get purchase analytics for a specific user (filtered by userId, falling back to
 * email — checkout's contact email doesn't have to match the account email, e.g.
 * card+PK accounts with a synthetic card.NNNN@client.local address).
 * Pass no filters to get store-wide analytics (admin use only).
 */
export function getUserPurchaseAnalytics(userEmail?: string, userId?: string, locale = 'ru-RU'): PurchaseAnalytics {
  const allOrders = useOrders.getState().orders
  if (!userEmail && !userId) return emptyPurchaseAnalytics()
  const normalizedEmail = userEmail?.toLowerCase()
  const orders = allOrders.filter(
    (order) => (userId && order.userId === userId) || (normalizedEmail && order.email.toLowerCase() === normalizedEmail)
  )
  return computePurchaseAnalytics(orders, locale)
}

/**
 * Get company analytics (requires company context)
 */
export function getCompanyAnalytics(companyId: string): CompanyAnalytics {
  const purchaseAnalytics = computePurchaseAnalytics(useOrders.getState().orders)
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
