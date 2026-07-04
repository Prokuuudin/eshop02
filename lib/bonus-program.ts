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

/** Курс балла: 1 балл = 1 цент. 100 баллов = 1 € скидки. */
export const BONUS_POINT_VALUE_EUR = 0.01

/** Баллы -> евро (для скидки при списании), округление до цента. */
export function pointsToEuros(points: number): number {
  return Math.max(0, Math.round(points * BONUS_POINT_VALUE_EUR * 100) / 100)
}

/** Евро -> баллы (для потолков списания), неполный балл отбрасывается. */
export function eurosToPoints(euros: number): number {
  return Math.max(0, Math.floor(euros / BONUS_POINT_VALUE_EUR + 1e-9))
}

export type BonusLineItem = {
  price: number
  quantity: number
  /** Баллы за единицу товара; приоритетнее процента, если > 0. */
  bonusRate?: number | null
}

/**
 * Баллы за заказ: bonusRate * qty для товаров с явной ставкой, иначе
 * ratePercent от суммы позиции, пересчитанный в баллы по курсу
 * BONUS_POINT_VALUE_EUR. Округление один раз по сумме заказа.
 */
export function calcOrderBonus(
  items: BonusLineItem[],
  ratePercent: number = DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent
): number {
  const base = items.reduce((sum, item) => {
    const quantity = Math.max(0, item.quantity)
    const rate = item.bonusRate ?? 0
    if (rate > 0) return sum + rate * quantity
    const eurBonus = (Math.max(0, item.price) * quantity * ratePercent) / 100
    return sum + eurBonus / BONUS_POINT_VALUE_EUR
  }, 0)
  return Math.max(0, Math.round(base))
}
