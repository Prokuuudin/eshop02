import { describe, expect, it } from 'vitest'
import { validatePromoCode, calculateDiscount, PROMO_CODES } from '@/lib/promo-codes'

describe('validatePromoCode', () => {
  it('returns promo for a valid code with sufficient order amount', () => {
    const result = validatePromoCode('WELCOME10', 100)
    expect(result).not.toBeNull()
    expect(result?.code).toBe('WELCOME10')
    expect(result?.discount).toBe(10)
  })

  it('is case-insensitive for the code', () => {
    const result = validatePromoCode('welcome10', 100)
    expect(result).not.toBeNull()
    expect(result?.code).toBe('WELCOME10')
  })

  it('returns null for an unknown code', () => {
    const result = validatePromoCode('FAKECODE', 500)
    expect(result).toBeNull()
  })

  it('returns null when order amount is below minOrder', () => {
    // SPRING20 requires minOrder 2000
    const result = validatePromoCode('SPRING20', 1999)
    expect(result).toBeNull()
  })

  it('returns promo when order amount exactly meets minOrder', () => {
    const result = validatePromoCode('SPRING20', 2000)
    expect(result).not.toBeNull()
    expect(result?.discount).toBe(20)
  })

  it('returns null for an expired promo code', () => {
    // Temporarily add an expired promo to the array for test
    const pastDate = new Date(Date.now() - 1000 * 60 * 60 * 24)
    PROMO_CODES.push({ code: 'EXPIRED99', discount: 99, expiresAt: pastDate })
    const result = validatePromoCode('EXPIRED99', 0)
    // cleanup
    PROMO_CODES.pop()
    expect(result).toBeNull()
  })

  it('returns promo for a code that has not yet expired', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24)
    PROMO_CODES.push({ code: 'FUTURE99', discount: 5, expiresAt: futureDate })
    const result = validatePromoCode('FUTURE99', 0)
    PROMO_CODES.pop()
    expect(result).not.toBeNull()
  })

  it('validates BEAUTY30 requiring minOrder 5000', () => {
    expect(validatePromoCode('BEAUTY30', 4999)).toBeNull()
    expect(validatePromoCode('BEAUTY30', 5000)).not.toBeNull()
    expect(validatePromoCode('BEAUTY30', 5000)?.discount).toBe(30)
  })

  it('validates SUMMER15 requiring minOrder 1500', () => {
    expect(validatePromoCode('SUMMER15', 1499)).toBeNull()
    expect(validatePromoCode('SUMMER15', 1500)?.discount).toBe(15)
  })
})

describe('calculateDiscount', () => {
  it('calculates a 10% discount correctly', () => {
    expect(calculateDiscount(1000, 10)).toBe(100)
  })

  it('calculates a 20% discount correctly', () => {
    expect(calculateDiscount(2000, 20)).toBe(400)
  })

  it('rounds the discount to nearest integer', () => {
    // 333 * 10 / 100 = 33.3 → rounds to 33
    expect(calculateDiscount(333, 10)).toBe(33)
  })

  it('returns 0 for 0% discount', () => {
    expect(calculateDiscount(1000, 0)).toBe(0)
  })

  it('returns the full amount for 100% discount', () => {
    expect(calculateDiscount(500, 100)).toBe(500)
  })

  it('returns 0 when amount is 0', () => {
    expect(calculateDiscount(0, 30)).toBe(0)
  })
})
