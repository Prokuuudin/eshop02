// Бонусная программа: конфиг по умолчанию и единый расчёт начисления.
// Без 'server-only' — модуль импортируют и клиент (cart/checkout/страница товара),
// и сервер (lib/server-pricing.ts). Сохранённый конфиг живёт в PostgreSQL
// (KeyValueSetting) и гидратируется в неперсистентный клиентский кэш.

export interface BonusProgramConfig {
  enabled: boolean
  earnRatePercent: number
  maxSpendPercent: number
  minOrderForEarn: number
  pointsExpiryDays: number
  minPointsToSpend: number
  maxEarnPerOrder: number
  /** One-time points credited on a client's first registration. 500 = €5. */
  welcomeBonusPoints: number
}

export const DEFAULT_BONUS_PROGRAM_CONFIG: BonusProgramConfig = {
  enabled: true,
  earnRatePercent: 0.5,
  maxSpendPercent: 100,
  minOrderForEarn: 0,
  pointsExpiryDays: 0,
  minPointsToSpend: 0,
  maxEarnPerOrder: 0,
  welcomeBonusPoints: 500,
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

export type PaymentEarnConfig = Pick<BonusProgramConfig, 'enabled' | 'earnRatePercent' | 'minOrderForEarn' | 'maxEarnPerOrder'>

const toCents = (euros: number): number => Math.round((Number.isFinite(euros) ? euros : 0) * 100)

/**
 * Баллы за оплаченный заказ: база — фактически оплаченная стоимость товаров после всех
 * скидок и списанных бонусов (итог заказа минус доставка), доставка не участвует.
 * Явная ставка товара (`bonusRate`) и процентная ставка уменьшаются пропорционально доле
 * оплаченной стоимости товаров. Округление вниз до целого балла — никогда не больше ставки.
 * Та же функция считает прогноз в чекауте и окончательное начисление при подтверждении оплаты.
 */
export function calcEarnedPointsForPayment(input: {
  items: BonusLineItem[]
  /** Сумма товаров до скидок (Σ цена × количество), евро. */
  goodsSubtotal: number
  /** Итог заказа, фактически оплачиваемый клиентом (после скидок и бонусов, с доставкой), евро. */
  total: number
  /** Доставка, входящая в итог, евро. */
  delivery: number
  config: PaymentEarnConfig
}): number {
  const { config } = input
  if (!config.enabled) return 0
  const subtotalCents = toCents(input.goodsSubtotal)
  const goodsPaidCents = Math.max(0, toCents(input.total) - toCents(input.delivery))
  if (subtotalCents <= 0 || goodsPaidCents <= 0) return 0
  if (goodsPaidCents < toCents(config.minOrderForEarn)) return 0
  const share = Math.min(1, goodsPaidCents / subtotalCents)
  const raw = input.items.reduce((sum, item) => {
    const quantity = Math.max(0, item.quantity)
    const rate = item.bonusRate ?? 0
    if (rate > 0) return sum + rate * quantity * share
    // 1 балл = 1 цент, поэтому баллы = оплаченные центы × ставка %.
    return sum + (toCents(Math.max(0, item.price) * quantity) * share * config.earnRatePercent) / 100
  }, 0)
  const points = Math.max(0, Math.floor(raw + 1e-9))
  return config.maxEarnPerOrder > 0 ? Math.min(points, config.maxEarnPerOrder) : points
}
