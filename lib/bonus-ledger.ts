import type { ExtendedTransactionClient } from '@/lib/prisma'
import { getBonusProgramConfig } from '@/lib/bonus-config-server-store'

/** Remove expired, still-unspent earned points and return the resulting balance. */
export async function expireBonusPoints(tx: ExtendedTransactionClient, userId: string): Promise<number> {
  const now = new Date()
  const lots = await tx.bonusTransaction.findMany({
    where: { userId, remainingPoints: { gt: 0 }, expiresAt: { lte: now } },
    orderBy: { expiresAt: 'asc' },
    select: { id: true, remainingPoints: true },
  })
  const expired = lots.reduce((sum, lot) => sum + lot.remainingPoints, 0)
  if (expired === 0) {
    return (await tx.user.findUnique({ where: { id: userId }, select: { bonusPoints: true } }))?.bonusPoints ?? 0
  }
  const current = await tx.user.findUnique({ where: { id: userId }, select: { bonusPoints: true } })
  const effectiveExpired = Math.min(expired, current?.bonusPoints ?? 0)
  const user = await tx.user.update({ where: { id: userId }, data: { bonusPoints: Math.max(0, (current?.bonusPoints ?? 0) - effectiveExpired) }, select: { bonusPoints: true } })
  await tx.bonusTransaction.updateMany({
    where: { id: { in: lots.map((lot) => lot.id) } },
    data: { remainingPoints: 0 },
  })
  await tx.bonusTransaction.create({
    data: { userId, type: 'expiry', points: -effectiveExpired, balanceAfter: user.bonusPoints, reason: 'Points expired' },
  })
  return user.bonusPoints
}

/** Consume expiring earn lots oldest-first when points leave the balance. */
export async function consumeBonusLots(tx: ExtendedTransactionClient, userId: string, points: number): Promise<void> {
  let left = Math.max(0, points)
  if (!left) return
  const lots = await tx.bonusTransaction.findMany({
    where: { userId, remainingPoints: { gt: 0 } },
    orderBy: [{ expiresAt: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, remainingPoints: true },
  })
  for (const lot of lots) {
    if (!left) break
    const used = Math.min(left, lot.remainingPoints)
    await tx.bonusTransaction.update({ where: { id: lot.id }, data: { remainingPoints: { decrement: used } } })
    left -= used
  }
}

/**
 * Credit the one-time welcome bonus on a client's first registration. Safe to
 * call from every activation path (card self-registration, company-card
 * claim, invitation acceptance) — a prior 'welcome' ledger row for the user
 * makes this a no-op, so it never double-credits across those paths.
 */
export async function grantWelcomeBonus(tx: ExtendedTransactionClient, userId: string): Promise<void> {
  const config = await getBonusProgramConfig(tx)
  const points = Math.max(0, Math.round(config.welcomeBonusPoints))
  if (!config.enabled || points <= 0) return

  const already = await tx.bonusTransaction.findFirst({ where: { userId, type: 'welcome' }, select: { id: true } })
  if (already) return

  const expiryDays = await getBonusExpiryDays(tx)
  const user = await tx.user.update({
    where: { id: userId },
    data: { bonusPoints: { increment: points } },
    select: { bonusPoints: true },
  })
  await tx.bonusTransaction.create({
    data: {
      userId,
      type: 'welcome',
      points,
      balanceAfter: user.bonusPoints,
      remainingPoints: points,
      expiresAt: bonusExpiryDate(expiryDays),
      reason: 'Welcome bonus',
    },
  })
}

export function bonusExpiryDate(days: number): Date | null {
  if (!Number.isFinite(days) || days <= 0) return null
  return new Date(Date.now() + Math.trunc(days) * 86_400_000)
}

export async function getBonusExpiryDays(tx: ExtendedTransactionClient): Promise<number> {
  const row = await tx.keyValueSetting.findUnique({ where: { key: 'bonusProgram' }, select: { value: true } })
  const value = row?.value as { pointsExpiryDays?: unknown } | undefined
  const days = Number(value?.pointsExpiryDays)
  return Number.isFinite(days) ? Math.min(3650, Math.max(0, Math.trunc(days))) : 0
}
