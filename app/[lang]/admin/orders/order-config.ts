import type { OrderStatus } from '@/lib/admin-store'

export type SortField = 'date' | 'total'
export type SortDir = 'asc' | 'desc'

export type CatalogProduct = {
  id: string
  title: string
  brand: string
  price: number
  stock: number
  image?: string
  sku?: string
}

export type EditItem = {
  id: string
  lineKey: string
  title: string
  price: number
  quantity: number
  image?: string
  variantLabel?: string
}

export const STATUS_LIST: OrderStatus[] = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled']

export const ALLOWED_STATUS_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
}

export function availableOrderStatuses(current: OrderStatus): OrderStatus[] {
  return [current, ...ALLOWED_STATUS_TRANSITIONS[current]]
}

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  confirmed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200',
  shipped: 'bg-primary/10 text-primary dark:bg-primary/15 dark:text-primary/60',
  delivered: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

// Dashboard-style surfaces used by order cards and status summaries across admin views.
export const STATUS_SURFACES: Record<OrderStatus, string> = {
  pending: 'border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20',
  confirmed: 'border-l-blue-500 bg-blue-50 dark:bg-blue-950/20',
  shipped: 'border-l-primary/70 bg-primary/5 dark:bg-primary/10',
  delivered: 'border-l-green-500 bg-green-50 dark:bg-green-950/20',
  cancelled: 'border-l-red-500 bg-red-50 dark:bg-red-950/20',
}

export const PAYMENT_COLORS: Record<string, string> = {
  unpaid: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200',
  refunded: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-200',
  failed: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200',
}

export const EDIT_DELIVERY_COSTS: Record<string, number> = { courier: 5, pickup: 0, post: 4, venipak: 3 }
export const ORDERS_PAGE_SIZE = 25
