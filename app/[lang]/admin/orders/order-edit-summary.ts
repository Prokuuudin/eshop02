import { isOrderTaxIncluded } from '@/lib/tax'
import { EDIT_DELIVERY_COSTS } from './order-config'
import type { useAdminOrdersPage } from './useAdminOrdersPage'

type State = ReturnType<typeof useAdminOrdersPage>
type Order = State['orders'][number]

export function calculateOrderEditSummary(
  order: Order,
  items: State['editItems'],
  deliveryMethod: string,
): { subtotal: number; delivery: number; discount: number; total: number } {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const delivery = EDIT_DELIVERY_COSTS[deliveryMethod] ?? 0
  const originalDiscountRatio = order.subtotal > 0 ? order.discount / order.subtotal : 0
  const discount = order.promoCode && originalDiscountRatio > 0
    ? Math.round(subtotal * originalDiscountRatio * 100) / 100
    : order.discount
  const total = Math.max(0, subtotal - discount + delivery + (isOrderTaxIncluded(order) ? 0 : order.tax))
  return { subtotal, delivery, discount, total }
}
