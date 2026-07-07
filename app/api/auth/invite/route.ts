import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword, createSession, SESSION_COOKIE } from '@/lib/server-auth'
import { readInvitations, writeInvitations, deriveStatus } from '@/lib/invitations'

export const runtime = 'nodejs'

class InviteConsumedError extends Error {}

type Found =
  | { ok: true; index: number }
  | { ok: false; res: NextResponse }

async function findValid(token: string | null): Promise<Found & { invitations: Awaited<ReturnType<typeof readInvitations>> }> {
  const invitations = await readInvitations(prisma)
  if (!token) {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 }), invitations }
  }
  const index = invitations.findIndex((i) => i.token === token)
  if (index < 0) {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 }), invitations }
  }
  const status = deriveStatus(invitations[index])
  // Письмо не ушло (status 'error') — токен не активируем: админский resend заменит запись
  if (status === 'error') {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 }), invitations }
  }
  if (status === 'accepted') {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'already_used' }, { status: 409 }), invitations }
  }
  if (status === 'expired') {
    return { ok: false, res: NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 }), invitations }
  }
  return { ok: true, index, invitations }
}

// GET: данные для формы активации
export async function GET(req: NextRequest) {
  try {
    const found = await findValid(req.nextUrl.searchParams.get('token'))
    if (!found.ok) return found.res
    const inv = found.invitations[found.index]
    // Ищем по id: email в инвайте принудительно lowercased, а User.email
    // хранится как есть (case-sensitive unique) — поиск по email ломается
    const user = await prisma.user.findUnique({
      where: { id: inv.userId },
      select: { name: true },
    })
    return NextResponse.json({ ok: true, email: inv.email, name: user?.name ?? '', cardNumber: inv.cardNumber })
  } catch (e) {
    console.error('[auth/invite GET]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}

// POST: активация спящего аккаунта
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { token?: string; password?: string }
    if (!body.password || body.password.length < 8) {
      return NextResponse.json({ ok: false, error: 'weak_password' }, { status: 400 })
    }

    const found = await findValid(body.token ?? null)
    if (!found.ok) return found.res
    const inv = found.invitations[found.index]

    // По id, не по email: инвайт хранит lowercased email, в User.email может быть верхний регистр
    const user = await prisma.user.findUnique({ where: { id: inv.userId } })
    if (!user) {
      return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })
    }

    const passwordHash = await hashPassword(body.password)
    const companyId = `company_master_${randomUUID()}`
    const companyName = user.name || inv.email

    try {
      await prisma.$transaction(
        async (tx) => {
          // Перечитать и потребить токен внутри транзакции — двойная активация
          // упирается в serializable-конфликт, а не плодит дубли компаний
          const fresh = await readInvitations(tx)
          const idx = fresh.findIndex((i) => i.token === body.token)
          if (idx < 0 || fresh[idx].acceptedAt) throw new InviteConsumedError()
          fresh[idx] = { ...fresh[idx], acceptedAt: new Date().toISOString(), status: 'accepted' }
          await writeInvitations(tx, fresh)

          // Персональная компания мастера (паттерн approveNoCardRequest).
          // Карта компании может быть занята (@unique) — проверяем заранее:
          // P2002 внутри транзакции необратимо абортит её (25P02), catch-retry не работает
          const cardTaken = await tx.company.findUnique({
            where: { cardNumber: inv.cardNumber },
            select: { id: true },
          })
          await tx.company.create({
            data: { id: companyId, companyName, cardNumber: cardTaken ? null : inv.cardNumber },
          })
          await tx.companyMember.create({
            data: {
              id: randomUUID(),
              companyId,
              userId: user.id,
              email: inv.email,
              name: user.name ?? inv.email,
              role: 'admin',
              addedBy: 'invitation',
            },
          })
          await tx.user.update({
            where: { id: user.id },
            data: {
              passwordHash,
              mustChangePassword: false,
              cardNumber: inv.cardNumber,
              companyId,
              companyName,
              teamRole: 'admin',
            },
          })
        },
        { isolationLevel: 'Serializable' }
      )
    } catch (e) {
      if (e instanceof InviteConsumedError || (e as { code?: string })?.code === 'P2034') {
        // Параллельная активация или уже потреблённый токен
        return NextResponse.json({ ok: false, error: 'already_used' }, { status: 409 })
      }
      throw e
    }

    const token = await createSession(user.id)
    const res = NextResponse.json({ ok: true, email: inv.email })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (e) {
    console.error('[auth/invite POST]', e)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
