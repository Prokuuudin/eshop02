import { Prisma } from '@/generated/prisma/client'

/**
 * Prisma returns Decimal-typed DB columns as a Prisma.Decimal (decimal.js) instance.
 * The app has always worked with these fields as plain `number` — this converts back
 * to that shape at the boundary. Defensive pass-through for plain numbers too (safe to
 * call whether or not the underlying column has been migrated yet — see
 * docs/superpowers/specs/2026-07-20-money-decimal-storage-design.md).
 */
export function toNum(value: Prisma.Decimal | number): number {
  return value instanceof Prisma.Decimal ? value.toNumber() : value
}

export function toNumOrNull(value: Prisma.Decimal | number | null): number | null {
  return value === null ? null : toNum(value)
}
