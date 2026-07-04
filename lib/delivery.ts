// Delivery fees in EUROS (all money in this codebase is euros, not cents).
// Single source of truth for the storefront (cart/checkout) and server pricing.

export const DELIVERY_FEES_EUR: Record<string, number> = {
  courier: 5,
  pickup: 0,
  post: 3,
}

export const DEFAULT_DELIVERY_FEE_EUR = DELIVERY_FEES_EUR.courier

/** Storefront promise: «Бесплатная доставка от 100 €» (benefits.deliveryFree). */
export const FREE_DELIVERY_FROM_EUR = 100

/**
 * Delivery fee for a method given the order subtotal after promo discount (euros).
 * Unknown/missing method falls back to the courier fee.
 */
export function calcDeliveryFee(method: string | null | undefined, subtotalAfterDiscount: number): number {
  const fee = DELIVERY_FEES_EUR[method ?? ''] ?? DEFAULT_DELIVERY_FEE_EUR
  if (fee === 0) return 0
  return subtotalAfterDiscount >= FREE_DELIVERY_FROM_EUR ? 0 : fee
}
