export type WholesaleOrderGuard = {
  isWholesaleRole: boolean
  minOrderAmount: number
  shortage: number
  isMinimumReached: boolean
}

export type RoleBasedMinOrderProduct = {
  minOrderQuantities?: Record<string, number>
}

export type RoleBasedPricingProduct = {
  price: number
  bulkPricingTiers?: Array<{ quantity: number; pricePerUnit: number }>
}

export const getWholesaleOrderGuard = (subtotal: number): WholesaleOrderGuard => {
  const minOrderAmount = 0
  const shortage = Math.max(0, minOrderAmount - subtotal)

  return {
    isWholesaleRole: false,
    minOrderAmount,
    shortage,
    isMinimumReached: true
  }
}

export const getDefaultMinQuantity = (): number => {
  return 1
}

export const getDisplayPrice = (basePrice: number): number => {
  return Math.max(0, Math.round(basePrice))
}

export const calculatePrice = (
  product: RoleBasedPricingProduct,
  quantity: number
): number => {
  let unitPrice = getDisplayPrice(product.price)

  const tier = product.bulkPricingTiers
    ?.filter((item) => quantity >= item.quantity)
    .sort((a, b) => b.quantity - a.quantity)[0]

  if (tier) {
    unitPrice = tier.pricePerUnit
  }

  return Math.max(0, Math.round(unitPrice))
}

export const getMinimumOrderQuantity = (
  product: RoleBasedMinOrderProduct
): number => {
  const explicitValues = Object.values(product.minOrderQuantities ?? {}).filter(
    (value): value is number => typeof value === 'number' && value >= 1
  )

  if (explicitValues.length > 0) {
    return Math.min(...explicitValues)
  }

  return getDefaultMinQuantity()
}
