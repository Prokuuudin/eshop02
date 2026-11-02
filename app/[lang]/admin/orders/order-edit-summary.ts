import { calcDeliveryFee } from '@/lib/delivery'
import { isOrderTaxIncluded } from '@/lib/tax'
import type { Order } from '@/lib/orders-store'

import type { useAdminOrdersPage } from './useAdminOrdersPage'

type State = ReturnType<typeof useAdminOrdersPage>

/**
 * The server recalculates a second-item discount when the lines of such an order change
 * (lib/orders-data-store.ts), so the preview below cannot show its final amount.
 */
export function willRecalculateSecondItemDiscount(order: Order, items: State['editItems']): boolean {
  const before = order.items as Array<Order['items'][number] & { promotionId?: string }>
  if (!before.some((item) => item.promotionId)) return false
  return items.length !== before.length
    || items.some((item, index) => item.id !== before[index].id || item.quantity !== before[index].quantity)
}

export function calculateOrderEditSummary(
  order: Order,
  items: State['editItems'],
  deliveryMethod: string,
  settings?: import('@/lib/commerce-settings').CommerceSettings,
): { subtotal: number; delivery: number; discount: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const originalDiscountRatio = order.subtotal > 0 ? order.discount / order.subtotal : 0
  const discount = order.promoCode && originalDiscountRatio > 0
    ? Math.round(subtotal * originalDiscountRatio * 100) / 100
    : order.discount
  const delivery = calcDeliveryFee(deliveryMethod, subtotal - discount, order.country, settings)
  const total = Math.max(0, subtotal - discount + delivery + (isOrderTaxIncluded(order) ? 0 : order.tax))
  return { subtotal, delivery, discount, total }
}
