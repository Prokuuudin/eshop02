import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function POST(req: NextRequest): Promise<Response> {
  try {
    const caller = await getServerUser()
    if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { delta, userId } = await req.json()
    if (typeof delta !== 'number') {
      return NextResponse.json({ error: 'delta_required' }, { status: 400 })
    }

    // Non-admin can only decrease their own balance (spend bonus points)
    // Positive delta (earning) is server-only — tied to orders/refunds, not client-controlled
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
    const newBalance = Math.max(0, user.bonusPoints + normalizedDelta)
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: targetId }, data: { bonusPoints: newBalance } })
      await tx.bonusTransaction.create({
        data: {
          userId: targetId,
          type: caller.id === targetId ? 'user_adjustment' : 'admin_adjustment',
          points: newBalance - user.bonusPoints,
          balanceAfter: newBalance,
          actorUserId: caller.id,
          reason: 'Bonus balance API adjustment',
        },
      })
    })

    return NextResponse.json({ newBalance })
  } catch (e) {
    console.error('[user/bonus POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// GET — return current balance from DB
export async function GET(): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { bonusPoints: true } })
    return NextResponse.json({ bonusPoints: row?.bonusPoints ?? 0 })
  } catch (e) {
    console.error('[user/bonus GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
