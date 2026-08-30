import type { CartItem } from './cart-store'
import { isLineSelected } from './cart-selection-store'
import { calcOrderBonus } from './bonus-program'
import { calculatePrice, getWholesaleOrderGuard } from './customer-segmentation'
import { extractVat } from './tax'

type CartDrawerSummary = {
  selectedItems: CartItem[]
  selectedItemIds: string[]
  bonusToEarn: number
  subtotal: number
  tax: number
  netSubtotal: number
  finalTotal: number
  wholesaleGuard: ReturnType<typeof getWholesaleOrderGuard>
  checkoutHref: string
}

export function getCartDrawerSummary(items: CartItem[], deselectedLineKeys: string[]): CartDrawerSummary {
  const selectedItems = items.filter((item) => isLineSelected(deselectedLineKeys, item.lineKey))
  const selectedItemIds = selectedItems.map((item) => item.lineKey)
  const subtotal = selectedItems.reduce(
    (sum, item) => sum + calculatePrice(item, item.quantity) * item.quantity,
    0
  )
  const tax = extractVat(subtotal)
  const bonusToEarn = calcOrderBonus(selectedItems.map((item) => ({
    price: calculatePrice(item, item.quantity),
    quantity: item.quantity,
    bonusRate: item.bonusRate,
  })))

  return {
    selectedItems,
    selectedItemIds,
    bonusToEarn,
    subtotal,
    tax,
    netSubtotal: subtotal - tax,
    finalTotal: subtotal,
    wholesaleGuard: getWholesaleOrderGuard(subtotal),
    checkoutHref: selectedItemIds.length > 0
      ? `/checkout?items=${encodeURIComponent(selectedItemIds.join(','))}`
      : '/checkout',
  }
}
