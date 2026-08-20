import type { Order } from './orders-store'
import type { CartItem } from './cart-store'

const DAY_MS = 24 * 60 * 60 * 1000
const MIN_PURCHASES = 3
const READY_THRESHOLD = 0.8

export interface ReorderSuggestion {
  item: CartItem
  lastOrderedAt: Date
  medianIntervalDays: number
  daysSinceLast: number
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

/**
 * Персонализированное «пора заказать снова»: товары, которые клиент покупает
 * регулярно, если с последней покупки прошло ≥80% его обычного интервала.
 * Порог 0.8 (не 1.0) — чтобы напомнить до того, как товар реально закончится.
 */
export const getReorderSuggestions = (orders: Order[], now: Date = new Date(), max = 4): ReorderSuggestion[] => {
  const purchases = new Map<string, { date: Date; item: CartItem }[]>()

  for (const order of orders) {
    const date = new Date(order.createdAt)
    for (const item of order.items) {
      const list = purchases.get(item.id) ?? []
      list.push({ date, item })
      purchases.set(item.id, list)
    }
  }

  const candidates: ReorderSuggestion[] = []

  for (const list of purchases.values()) {
    if (list.length < MIN_PURCHASES) continue
    list.sort((a, b) => a.date.getTime() - b.date.getTime())

    const intervals: number[] = []
    for (let i = 1; i < list.length; i++) {
      intervals.push((list[i].date.getTime() - list[i - 1].date.getTime()) / DAY_MS)
    }
    const medianIntervalDays = median(intervals)
    if (medianIntervalDays <= 0) continue

    const last = list[list.length - 1]
    const daysSinceLast = (now.getTime() - last.date.getTime()) / DAY_MS
    const ratio = daysSinceLast / medianIntervalDays
    if (ratio < READY_THRESHOLD) continue

    candidates.push({ item: last.item, lastOrderedAt: last.date, medianIntervalDays, daysSinceLast })
  }

  candidates.sort((a, b) => b.daysSinceLast / b.medianIntervalDays - a.daysSinceLast / a.medianIntervalDays)
  return candidates.slice(0, max)
}
