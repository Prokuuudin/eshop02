// Product prices are VAT-inclusive (Latvia VAT 21%). Cart/checkout totals must not
// add tax on top of the subtotal again — this only extracts the VAT portion already
// baked into the price, for informational display (invoices, order summaries).
export const VAT_RATE = 0.21

export function extractVat(grossAmount: number): number {
  return Math.round((grossAmount - grossAmount / (1 + VAT_RATE)) * 100) / 100
}

type OrderTotals = {
  subtotal: number
  discount: number
  delivery: number
  tax: number
  total: number
  bonusSpent?: number
}

/**
 * Orders placed before catalog prices became VAT-inclusive stored `tax` as an amount
 * added on top of `subtotal` to reach `total`. Orders placed after store `tax` as
 * informational only (VAT already inside `subtotal`). There's no separate flag for
 * this (no schema change) — each order already "declares" which model it used, since
 * only one of the two reconstructs its own stored `total`. Pick whichever fits.
 */
export function isOrderTaxIncluded(order: OrderTotals): boolean {
  const bonusSpent = order.bonusSpent ?? 0
  const withoutTax = order.subtotal - order.discount + order.delivery - bonusSpent
  const withTaxAdded = withoutTax + order.tax
  return Math.abs(order.total - withoutTax) <= Math.abs(order.total - withTaxAdded)
}

/** VAT amount to display for an order, correct under either pricing model. */
export function displayOrderTax(order: OrderTotals): number {
  return isOrderTaxIncluded(order) ? extractVat(order.subtotal - order.discount) : order.tax
}
