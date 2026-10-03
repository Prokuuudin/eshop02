// Pure integer-money primitives. This module deliberately has no Prisma/Decimal
// dependency so market analysis can run without loading generated Prisma runtime.

/** Decimal(12,2): 10 integer digits → max 9,999,999,999.99. */
export const MAX_MONEY_CENTS = 999_999_999_999

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

export function assertCents(cents: number): void {
  if (!Number.isSafeInteger(cents) || Math.abs(cents) > MAX_MONEY_CENTS) {
    throw new MoneyError('Cents must be a safe integer in range')
  }
}

/** Integer cents → canonical "12.34" string (Decimal(12,2) input format). */
export function centsToMoneyString(cents: number): string {
  assertCents(cents)
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

export function isPositiveCents(cents: number | null | undefined): cents is number {
  return typeof cents === 'number' && Number.isSafeInteger(cents) && cents > 0 && cents <= MAX_MONEY_CENTS
}

/** Signed percent change in basis points, rounded half away from zero with BigInt math. */
export function changeBasisPoints(fromCents: number, toCents: number): number {
  assertCents(fromCents)
  assertCents(toCents)
  if (fromCents <= 0) throw new MoneyError('Base price must be positive')
  const base = BigInt(fromCents)
  const numerator = BigInt(toCents - fromCents) * 10_000n
  const negative = numerator < 0n
  const abs = negative ? -numerator : numerator
  const quotient = abs / base
  const rounded = (abs % base) * 2n >= base ? quotient + 1n : quotient
  const result = Number(rounded)
  return negative ? -result : result
}

/** Basis points → "12.34" percent string for Decimal(7,2) columns. */
export function basisPointsToPercentString(bps: number): string {
  return centsToMoneyString(bps)
}
