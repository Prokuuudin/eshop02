import { NextRequest, NextResponse } from 'next/server'
import { randomBytes, randomUUID } from 'node:crypto'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { hashPassword, requireAdmin } from '@/lib/server-auth'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'

export const runtime = 'nodejs'

// POST: вручную назначить номер карты клиенту (замена ERP-импорта).
// Если клиент с таким email уже есть — просто проставляем ему карту (как раньше).
// Если email в системе ещё нет — заводим «спящий» аккаунт (паттерн import-client-cards):
// вход по паролю невозможен, активация только через инвайт с этой страницы.
export async function POST(req: NextRequest): Promise<Response> {
  const gate = await requireAdmin()
  if (gate instanceof NextResponse) return gate

  try {
    const body = (await req.json()) as { email?: string; cardNumber?: string; name?: string; phone?: string }
    const email = body.email?.trim()
    const cardNumber = normalizeCardNumber(body.cardNumber ?? '')
    const name = body.name?.trim() || null
    const phone = body.phone?.trim() || null
    if (!email || !cardNumber) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    if (!isValidCardNumber(cardNumber)) {
      return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    if ((name?.length ?? 0) > 120 || (phone?.length ?? 0) > 32) {
      return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
    }

    // Case-insensitive: User.email хранится как есть (mixed case), уникальный индекс case-sensitive
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      select: { id: true },
    })

    try {
      if (user) {
        await prisma.user.update({ where: { id: user.id }, data: { cardNumber } })
        return NextResponse.json({ ok: true, userId: user.id, created: false })
      }

      // Новый клиент: почта и телефон уже собраны при выдаче карты,
      // остальные данные (пароль, регистрация) клиент задаст сам по инвайту.
      if (!phone) {
        return NextResponse.json({ error: 'phone_required' }, { status: 400 })
      }
      const passwordHash = await hashPassword(randomBytes(32).toString('hex'))
      const created = await prisma.user.create({
        data: {
          id: randomUUID(),
          email: email.toLowerCase(),
          passwordHash,
          name,
          phone,
          cardNumber,
          platformRole: 'customer',
          mustChangePassword: true,
        },
        select: { id: true },
      })
      return NextResponse.json({ ok: true, userId: created.id, created: true })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        return NextResponse.json({ error: 'card_taken' }, { status: 409 })
      }
      throw e
    }
  } catch (e) {
    logApiError("[admin/invitations/card POST]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





