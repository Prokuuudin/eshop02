import { describe, it, expect } from 'vitest'
import {
  calcOrderBonus,
  pointsToEuros,
  eurosToPoints,
  BONUS_POINT_VALUE_EUR,
  DEFAULT_BONUS_PROGRAM_CONFIG,
} from './bonus-program'

describe('DEFAULT_BONUS_PROGRAM_CONFIG', () => {
  it('earn rate is 0.5% per business rule', () => {
    expect(DEFAULT_BONUS_PROGRAM_CONFIG.earnRatePercent).toBe(0.5)
  })

  it('point value is 1 cent', () => {
    expect(BONUS_POINT_VALUE_EUR).toBe(0.01)
  })
})

describe('pointsToEuros / eurosToPoints', () => {
  it('100 points = 1 euro', () => {
    expect(pointsToEuros(100)).toBe(1)
    expect(eurosToPoints(1)).toBe(100)
  })

  it('rounds euros to cents', () => {
    expect(pointsToEuros(333)).toBe(3.33)
  })

  it('floors partial points on euro->points conversion', () => {
    expect(eurosToPoints(0.999)).toBe(99)
  })

  it('never returns negative', () => {
    expect(pointsToEuros(-5)).toBe(0)
    expect(eurosToPoints(-5)).toBe(0)
  })
})

describe('calcOrderBonus', () => {
  it('returns 0 for an empty order', () => {
    expect(calcOrderBonus([])).toBe(0)
  })

  it('falls back to 0.5% of item subtotal, in points (€200 -> 100 points)', () => {
    // 0.5% of €200 = €1 = 100 points
    expect(calcOrderBonus([{ price: 200, quantity: 1 }])).toBe(100)
  })

  it('small order earns visible points (€30 -> 15 points)', () => {
    expect(calcOrderBonus([{ price: 30, quantity: 1 }])).toBe(15)
  })

  it('median product is visible (€15.40 -> 8 points)', () => {
    expect(calcOrderBonus([{ price: 15.4, quantity: 1 }])).toBe(8) // 7.7 -> 8
  })

  it('rounds once per order, not per item', () => {
    // €0.50 items: 0.25 points each; per-item rounding would give 0+0, order-level 0.5 -> 1
    expect(calcOrderBonus([
      { price: 0.5, quantity: 1 },
      { price: 0.5, quantity: 1 },
    ])).toBe(1)
  })

  it('prefers explicit bonusRate (points per unit) over the percent', () => {
    expect(calcOrderBonus([{ price: 100, quantity: 3, bonusRate: 5 }])).toBe(15)
  })

  it('treats bonusRate null as missing', () => {
    expect(calcOrderBonus([{ price: 200, quantity: 1, bonusRate: null }])).toBe(100)
  })

  it('mixes bonusRate items with percent-fallback items', () => {
    expect(calcOrderBonus([
      { price: 100, quantity: 1, bonusRate: 10 },
      { price: 200, quantity: 1 },
    ])).toBe(110) // 10 + 100
  })

  it('multiplies fallback by quantity', () => {
    // €6 * 40 = €240 -> 0.5% = €1.20 = 120 points
    expect(calcOrderBonus([{ price: 6, quantity: 40 }])).toBe(120)
  })

  it('ignores negative price and quantity', () => {
    expect(calcOrderBonus([{ price: -100, quantity: 1 }])).toBe(0)
    expect(calcOrderBonus([{ price: 100, quantity: -1 }])).toBe(0)
  })

  it('accepts a custom rate percent', () => {
    // 5% of €100 = €5 = 500 points
    expect(calcOrderBonus([{ price: 100, quantity: 1 }], 5)).toBe(500)
  })
})
