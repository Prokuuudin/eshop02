import { describe, it, expect } from 'vitest'
import { calcOrderBonus, DEFAULT_BONUS_PROGRAM_CONFIG } from './bonus-program'

describe('DEFAULT_BONUS_PROGRAM_CONFIG', () => {
  it('earn rate is 0.5% per business rule', () => {
    expect(DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent).toBe(0.5)
  })
})

describe('calcOrderBonus', () => {
  it('returns 0 for an empty order', () => {
    expect(calcOrderBonus([])).toBe(0)
  })

  it('falls back to 0.5% of item subtotal when bonusRate is missing', () => {
    // 0.5% of 200 = 1
    expect(calcOrderBonus([{ price: 200, quantity: 1 }])).toBe(1)
  })

  it('rounds to 0 on small orders (€60 -> 0.3 points)', () => {
    expect(calcOrderBonus([{ price: 60, quantity: 1 }])).toBe(0)
  })

  it('rounds 0.5 up (€100 -> 1 point)', () => {
    expect(calcOrderBonus([{ price: 100, quantity: 1 }])).toBe(1)
  })

  it('rounds once per order, not per item', () => {
    // per-item rounding would give 0 + 0; order-level: 0.25 + 0.25 = 0.5 -> 1
    expect(calcOrderBonus([
      { price: 50, quantity: 1 },
      { price: 50, quantity: 1 },
    ])).toBe(1)
  })

  it('prefers explicit bonusRate (points per unit) over the percent', () => {
    expect(calcOrderBonus([{ price: 100, quantity: 3, bonusRate: 5 }])).toBe(15)
  })

  it('treats bonusRate null as missing', () => {
    expect(calcOrderBonus([{ price: 200, quantity: 1, bonusRate: null }])).toBe(1)
  })

  it('mixes bonusRate items with percent-fallback items', () => {
    expect(calcOrderBonus([
      { price: 100, quantity: 1, bonusRate: 10 },
      { price: 200, quantity: 1 },
    ])).toBe(11)
  })

  it('multiplies fallback by quantity', () => {
    // 15.40 * 10 = 154; 0.5% = 0.77 -> 1
    expect(calcOrderBonus([{ price: 15.4, quantity: 10 }])).toBe(1)
  })

  it('ignores negative price and quantity', () => {
    expect(calcOrderBonus([{ price: -100, quantity: 1 }])).toBe(0)
    expect(calcOrderBonus([{ price: 100, quantity: -1 }])).toBe(0)
  })

  it('accepts a custom rate percent', () => {
    expect(calcOrderBonus([{ price: 100, quantity: 1 }], 5)).toBe(5)
  })
})
