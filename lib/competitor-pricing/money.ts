import { Prisma } from '@/generated/prisma/client'
import { MAX_MONEY_CENTS, MoneyError, centsToMoneyString } from './integer-money'
export { MoneyError, basisPointsToPercentString, centsToMoneyString, changeBasisPoints, isPositiveCents } from './integer-money'

// Competitor pricing works in integer euro cents. Values enter from Prisma.Decimal
// (Decimal(12,2) columns, same as Product.price) or numeric strings and never pass
// through a JS float. Decimal(12,2) max is < 10^12 cents, well inside Number.MAX_SAFE_INTEGER.

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
  if (cents.abs().gt(MAX_MONEY_CENTS)) throw new MoneyError('Money value out of range')
  return cents.toNumber()
}

export function moneyToCentsOrNull(value: Prisma.Decimal | string | null | undefined): number | null {
  return value === null || value === undefined ? null : moneyToCents(value)
}

export function centsToDecimal(cents: number): Prisma.Decimal {
  return new Prisma.Decimal(centsToMoneyString(cents))
}

/** Exact Decimal equality at cent precision (no float). */
export function sameMoneyExact(a: Prisma.Decimal | string, b: Prisma.Decimal | string): boolean {
  return moneyToCents(a) === moneyToCents(b)
}
