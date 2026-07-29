import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'

export const runtime = 'nodejs'

// POST: вручную назначить номер карты существующему клиенту (замена ERP-импорта)
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { email?: string; cardNumber?: string }
    const email = body.email?.trim()
    const cardNumber = body.cardNumber?.trim()
    if (!email || !cardNumber) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    if (!/^\d{4,10}$/.test(cardNumber)) {
      return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
    }

    // Case-insensitive: User.email хранится как есть (mixed case), уникальный индекс case-sensitive
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

    try {
      await prisma.user.update({ where: { id: user.id }, data: { cardNumber } })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        return NextResponse.json({ error: 'card_taken' }, { status: 409 })
      }
      throw e
    }

    return NextResponse.json({ ok: true, userId: user.id })
  } catch (e) {
    console.error('[admin/invitations/card POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
