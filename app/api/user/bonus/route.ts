import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { bonusExpiryDate, consumeBonusLots, expireBonusPoints, getBonusExpiryDays } from '@/lib/bonus-ledger'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const caller = await getServerUser()
    if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { delta, userId } = await req.json()
    if (typeof delta !== 'number') {
      return NextResponse.json({ error: 'delta_required' }, { status: 400 })
    }

    // Non-admin can only decrease their own balance (spend bonus points)
    // Positive delta (earning) is server-only נtied to orders/refunds, not client-controlled
    if (caller.platformRole !== 'admin' && delta > 0) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    // Non-admin can only adjust their own balance
    const targetId = (caller.platformRole === 'admin' && userId) ? String(userId) : caller.id

    const user = await prisma.user.findUnique({ where: { id: targetId } })
    if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

    const normalizedDelta = Math.trunc(delta)
    if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) {
      return NextResponse.json({ error: 'invalid_delta' }, { status: 400 })
    }
    const newBalance = await prisma.$transaction(async (tx) => {
      const currentBalance = await expireBonusPoints(tx, targetId)
      const nextBalance = Math.max(0, currentBalance + normalizedDelta)
      const actualDelta = nextBalance - currentBalance
      if (actualDelta < 0) await consumeBonusLots(tx, targetId, -actualDelta)
      const expiryDays = actualDelta > 0 ? await getBonusExpiryDays(tx) : 0
      await tx.user.update({ where: { id: targetId }, data: { bonusPoints: nextBalance } })
      await tx.bonusTransaction.create({
        data: {
          userId: targetId,
          type: caller.id === targetId ? 'user_adjustment' : 'admin_adjustment',
          points: actualDelta,
          balanceAfter: nextBalance,
          actorUserId: caller.id,
          reason: 'Bonus balance API adjustment',
          remainingPoints: Math.max(0, actualDelta),
          expiresAt: actualDelta > 0 ? bonusExpiryDate(expiryDays) : null,
        },
      })
      return nextBalance
    })

    return NextResponse.json({ newBalance })
  } catch (e) {
    logApiError("[user/bonus POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// GET נreturn current balance from DB
export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const bonusPoints = await prisma.$transaction((tx) => expireBonusPoints(tx, user.id))
    return NextResponse.json({ bonusPoints })
  } catch (e) {
    logApiError("[user/bonus GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


