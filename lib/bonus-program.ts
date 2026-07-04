// Бонусная программа: конфиг по умолчанию и единый расчёт начисления.
// Без 'server-only' — модуль импортируют и клиент (cart/checkout/страница товара),
// и сервер (lib/server-pricing.ts). Конфиг админки живёт в localStorage каждого
// браузера и на начисление не влияет — процент берётся из этого дефолта.

export interface BonusProgramConfig {
  enabled: boolean
  earnRatePercent: number
  maxSpendPercent: number
  minOrderForEarn: number
  pointsExpiryDays: number
  minPointsToSpend: number
  maxEarnPerOrder: number
}

export const DEFAULT_BONUS_PROGRAM_CONFIG: BonusProgramConfig = {
  enabled: true,
  earnRatePercent: 0.5,
  maxSpendPercent: 100,
  minOrderForEarn: 0,
  pointsExpiryDays: 0,
  minPointsToSpend: 0,
  maxEarnPerOrder: 0,
}

export type BonusLineItem = {
  price: number
  quantity: number
  /** Баллы за единицу товара; приоритетнее процента, если > 0. */
  bonusRate?: number | null
}

/**
 * Баллы за заказ: bonusRate * qty для товаров с явной ставкой, иначе
 * ratePercent от суммы позиции. Округление один раз по сумме заказа —
 * иначе при 0.5% каждая позиция по отдельности давала бы 0.
 */
export function calcOrderBonus(
  items: BonusLineItem[],
  ratePercent: number = DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent
): number {
  const base = items.reduce((sum, item) => {
    const quantity = Math.max(0, item.quantity)
    const rate = item.bonusRate ?? 0
    if (rate > 0) return sum + rate * quantity
    return sum + (Math.max(0, item.price) * quantity * ratePercent) / 100
  }, 0)
  return Math.max(0, Math.round(base))
}
