import { describe, expect, it } from 'vitest'
import { Prisma } from '@/generated/prisma/client'
import {
  MoneyError,
  basisPointsToPercentString,
  centsToDecimal,
  centsToMoneyString,
  changeBasisPoints,
  isPositiveCents,
  moneyToCents,
  sameMoneyExact,
} from './money'

describe('moneyToCents', () => {
  it('converts Decimal and strings exactly (no float drift)', () => {
    expect(moneyToCents(new Prisma.Decimal('18.90'))).toBe(1890)
    expect(moneyToCents('0.1')).toBe(10)
    expect(moneyToCents('0.29')).toBe(29) // 0.29 * 100 = 28.999999999999996 in float
    expect(moneyToCents('9999999999.99')).toBe(999999999999)
  })

  it('rejects more than 2 fraction digits, NaN, Infinity and garbage', () => {
    expect(() => moneyToCents('1.005')).toThrow(MoneyError)
    expect(() => moneyToCents('NaN')).toThrow(MoneyError)
    expect(() => moneyToCents('Infinity')).toThrow(MoneyError)
    expect(() => moneyToCents('abc')).toThrow(MoneyError)
  })

  it('rejects values beyond Decimal(12,2)', () => {
    expect(() => moneyToCents('10000000000.00')).toThrow(MoneyError)
  })
})

describe('centsToMoneyString / centsToDecimal', () => {
  it('formats canonical Decimal(12,2) strings', () => {
    expect(centsToMoneyString(1890)).toBe('18.90')
    expect(centsToMoneyString(5)).toBe('0.05')
    expect(centsToMoneyString(-70)).toBe('-0.70')
    expect(centsToDecimal(1820).equals(new Prisma.Decimal('18.20'))).toBe(true)
  })

  it('rejects non-integer cents', () => {
    expect(() => centsToMoneyString(18.9)).toThrow(MoneyError)
  })
})

describe('isPositiveCents / sameMoneyExact', () => {
  it('treats 0, negatives and null as not a usable price', () => {
    expect(isPositiveCents(0)).toBe(false)
    expect(isPositiveCents(-1)).toBe(false)
    expect(isPositiveCents(null)).toBe(false)
    expect(isPositiveCents(1)).toBe(true)
    expect(isPositiveCents(1_000_000_000_000)).toBe(false)
  })

  it('compares Decimal values at cent precision', () => {
    expect(sameMoneyExact(new Prisma.Decimal('18.2'), '18.20')).toBe(true)
    expect(sameMoneyExact('18.21', '18.20')).toBe(false)
  })
})

describe('changeBasisPoints', () => {
  it('computes signed percent change in basis points with half-away-from-zero rounding', () => {
    expect(changeBasisPoints(1890, 1820)).toBe(-370) // -3.7037% → -3.70%
    expect(changeBasisPoints(1000, 1100)).toBe(1000)
    expect(changeBasisPoints(300, 301)).toBe(33) // 0.3333%
    expect(changeBasisPoints(200, 201)).toBe(50) // exactly 0.5% → 50 bps
    expect(changeBasisPoints(1000, 1000)).toBe(0)
    expect(basisPointsToPercentString(-370)).toBe('-3.70')
  })

  it('stays exact for large prices', () => {
    expect(changeBasisPoints(999_999_999_999, 1)).toBe(-10_000)
  })

  it('requires a positive base', () => {
    expect(() => changeBasisPoints(0, 100)).toThrow(MoneyError)
  })
})
