import { Prisma } from '@/generated/prisma/client'

// Competitor pricing works in integer euro cents. Values enter from Prisma.Decimal
// (Decimal(12,2) columns, same as Product.price) or numeric strings and never pass
// through a JS float. Decimal(12,2) max is < 10^12 cents, well inside Number.MAX_SAFE_INTEGER.

// Decimal(12,2): 10 integer digits → max 9,999,999,999.99.
const MAX_CENTS = 999_999_999_999

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/** Exact Decimal/string → integer cents. Rejects >2 fraction digits, NaN, Infinity, out of range. */
export function moneyToCents(value: Prisma.Decimal | string): number {
  let decimal: Prisma.Decimal
  try {
    decimal = new Prisma.Decimal(value)
  } catch {
    throw new MoneyError(`Not a money value: ${String(value).slice(0, 32)}`)
  }
  if (!decimal.isFinite()) throw new MoneyError('Money value must be finite')
  const cents = decimal.mul(100)
  if (!cents.isInteger()) throw new MoneyError('Money value has more than 2 fraction digits')
  if (cents.abs().gt(MAX_CENTS)) throw new MoneyError('Money value out of range')
  return cents.toNumber()
}

export function moneyToCentsOrNull(value: Prisma.Decimal | string | null | undefined): number | null {
  return value === null || value === undefined ? null : moneyToCents(value)
}

function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_CENTS) throw new MoneyError('Cents must be a safe integer in range')
}

/** Integer cents → canonical "12.34" string (Decimal(12,2) input format). */
export function centsToMoneyString(cents: number): string {
  assertCents(cents)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function centsToDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(centsToMoneyString(cents))
}

export function isPositiveCents(cents: number | null | undefined): cents is number {
  return typeof cents === 'number' && Number.isSafeInteger(cents) && cents > 0
}

/** Exact Decimal equality at cent precision (no float). */
export function sameMoneyExact(a: Prisma.Decimal | string, b: Prisma.Decimal | string): boolean {
  return moneyToCents(a) === moneyToCents(b)
}

/**
 * (to - from) / from in basis points (1% = 100), rounded half away from zero, integer-only math.
 * `from` must be positive.
 */
export function changeBasisPoints(fromCents: number, toCents: number): number {
  assertCents(fromCents)
  assertCents(toCents)
  if (fromCents <= 0) throw new MoneyError('Base price must be positive')
  // BigInt: (Δcents × 10_000) can exceed Number.MAX_SAFE_INTEGER for large prices.
  const base = BigInt(fromCents)
  const numerator = BigInt(toCents - fromCents) * BigInt(10_000)
  const negative = numerator < BigInt(0)
  const abs = negative ? -numerator : numerator
  const quotient = abs / base
  const rounded = (abs % base) * BigInt(2) >= base ? quotient + BigInt(1) : quotient
  const result = Number(rounded)
  return negative ? -result : result
}

/** Basis points → "12.34" percent string for Decimal(7,2) columns. */
export function basisPointsToPercentString(bps: number): string {
  return centsToMoneyString(bps)
}
