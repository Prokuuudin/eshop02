import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export async function POST(req: NextRequest) {
  try {
    const caller = await getServerUser()
    if (!caller) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { delta, userId } = await req.json()
    if (typeof delta !== 'number') {
      return NextResponse.json({ error: 'delta_required' }, { status: 400 })
    }

    // Non-admin can only adjust their own balance
    const targetId = (caller.platformRole === 'admin' && userId) ? String(userId) : caller.id

    const user = await prisma.user.findUnique({ where: { id: targetId } })
    if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

    const newBalance = Math.max(0, user.bonusPoints + delta)
    await prisma.user.update({ where: { id: targetId }, data: { bonusPoints: newBalance } })

    return NextResponse.json({ newBalance })
  } catch (e) {
    console.error('[user/bonus POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// GET — return current balance from DB
export async function GET() {
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
