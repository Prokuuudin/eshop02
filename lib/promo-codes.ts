export interface PromoCode {
  code: string
  discount: number // percentage (0-100)
  maxUses?: number
  usedCount?: number
  expiresAt?: Date
  minOrder?: number // minimum order amount
}

export const PROMO_CODES: PromoCode[] = [
  {
    code: 'WELCOME10',
    discount: 10,
    minOrder: 0
  },
  {
    code: 'SPRING20',
    discount: 20,
    minOrder: 2000
  },
  {
    code: 'BEAUTY30',
    discount: 30,
    minOrder: 5000
  },
  {
    code: 'SUMMER15',
    discount: 15,
    minOrder: 1500
  }
]

export const validatePromoCode = (code: string, orderAmount: number): PromoCode | null => {
  const promo = PROMO_CODES.find((p) => p.code.toUpperCase() === code.toUpperCase())

  if (!promo) return null
  if (promo.minOrder && orderAmount < promo.minOrder) return null
  if (promo.expiresAt && new Date() > promo.expiresAt) return null

  return promo
}

export const calculateDiscount = (amount: number, discount: number): number => {
  return Math.round((amount * discount) / 100)
}
