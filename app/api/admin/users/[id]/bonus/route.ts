import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'

const adjustmentSchema = z.object({
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0),
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
      const before = await tx.user.findUnique({ where: { id }, select: { email: true, bonusPoints: true } })
      if (!before) return null
      const bonusPoints = Math.max(0, before.bonusPoints + parsed.data.delta)
      const user = await tx.user.update({ where: { id }, data: { bonusPoints }, select: { id: true, bonusPoints: true } })
      await tx.bonusTransaction.create({
        data: {
          userId: id,
          type: 'admin_adjustment',
          points: bonusPoints - before.bonusPoints,
          balanceAfter: bonusPoints,
          actorUserId: actor.id,
          reason: 'Administrative bonus adjustment',
        },
      })
      await appendServerAudit(tx, request, actor, {
          action: 'user.bonus_adjusted', entityType: 'user', entityId: id, entityTitle: before.email,
          before: { bonusPoints: before.bonusPoints },
          after: { bonusPoints },
          details: `delta=${parsed.data.delta}`,
          reason: 'Administrative bonus adjustment',
      })
      return user
    })

    if (!updated) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    return NextResponse.json({ user: updated })
  } catch (error) {
    console.error('[admin/users/:id/bonus POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
