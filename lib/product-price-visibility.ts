const PRICE_FIELDS = new Set([
  'price',
  'oldPrice',
  'priceAdjustment',
  'pricePerUnit',
  'bulkPricingTiers',
  'bonusRate',
  'discount',
  'discountAmount',
  'discountPercent',
  'discountRate',
  'coefficient',
  'multiplier',
])

function redactValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redactValue)
  if (!value || typeof value !== 'object' || value instanceof Date) return value

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !PRICE_FIELDS.has(key))
      .map(([key, nested]) => [key, redactValue(nested)])
  )
}

/**
 * Removes every monetary catalog field before data crosses a public boundary.
 * The recursive pass also covers variant price adjustments nested in product
 * configuration objects.
 */
export function redactProductPrices<T>(value: T): T {
  return redactValue(value) as T
}
