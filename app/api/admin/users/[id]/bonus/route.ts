import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { bonusExpiryDate, consumeBonusLots, expireBonusPoints, getBonusExpiryDays } from '@/lib/bonus-ledger'

const adjustmentSchema = z.object({
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
  reason: z.string().trim().min(3).max(500),
})

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const actor = await requireAdminPermission('settings.manage')
  if (actor instanceof NextResponse) return actor

  const parsed = adjustmentSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid_bonus_adjustment' }, { status: 400 })
  }

  const { id } = await params
  try {
    const updated = await prisma.$transaction(async (tx) => {
      // Serialize adjustments for one balance. Without a row lock, concurrent
      // admins can both read the same value and one absolute update gets lost.
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${id} FOR UPDATE`
      await expireBonusPoints(tx, id)
      const before = await tx.user.findUnique({ where: { id }, select: { email: true, bonusPoints: true } })
      if (!before) return null
      const bonusPoints = Math.max(0, before.bonusPoints + parsed.data.delta)
      const actualDelta = bonusPoints - before.bonusPoints
      if (actualDelta < 0) await consumeBonusLots(tx, id, -actualDelta)
      const expiryDays = actualDelta > 0 ? await getBonusExpiryDays(tx) : 0
      const user = await tx.user.update({ where: { id }, data: { bonusPoints }, select: { id: true, bonusPoints: true } })
      await tx.bonusTransaction.create({
        data: {
          userId: id,
          type: 'admin_adjustment',
          points: actualDelta,
          balanceAfter: bonusPoints,
          actorUserId: actor.id,
          reason: parsed.data.reason,
          remainingPoints: Math.max(0, actualDelta),
          expiresAt: actualDelta > 0 ? bonusExpiryDate(expiryDays) : null,
        },
      })
      await appendServerAudit(tx, request, actor, {
          action: 'user.bonus_adjusted', entityType: 'user', entityId: id, entityTitle: before.email,
          before: { bonusPoints: before.bonusPoints },
          after: { bonusPoints },
          details: `delta=${actualDelta}`,
          reason: parsed.data.reason,
      })
      return user
    })

    if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ user: updated })
  } catch (error) {
    logApiError("[admin/users/:id/bonus POST]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
