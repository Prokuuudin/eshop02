import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword, createSession, SESSION_COOKIE } from '@/lib/server-auth'
import { hashInviteToken } from '@/lib/invitations'
import { checkRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'
const INVITE_ATTEMPT_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 10 }

function clientIp(req: NextRequest): string {
  return req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || 'unknown'
}

class InviteConsumedError extends Error {}

async function findValid(token: string | null) {
  if (!token) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 }) }
  }
  const invitation = await prisma.invitationToken.findUnique({
    where: { tokenHash: hashInviteToken(token) },
  })
  if (!invitation || invitation.status === 'error') {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 }) }
  }
  if (invitation.status === 'accepted') {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: 'already_used' }, { status: 409 }) }
  }
  if (invitation.expiresAt < new Date()) {
    return { ok: false as const, res: NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 }) }
  }
  return { ok: true as const, invitation }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const found = await findValid(req.nextUrl.searchParams.get('token'))
    if (!found.ok) return found.res
    const inv = found.invitation
    const user = await prisma.user.findUnique({ where: { id: inv.userId }, select: { name: true } })
    return NextResponse.json({ ok: true, email: inv.email, name: user?.name ?? '', cardNumber: inv.cardNumber })
  } catch (error) {
    console.error('[auth/invite GET]', error)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const body = (await req.json()) as { token?: string; password?: string }
    const tokenHash = hashInviteToken(body.token ?? '')
    const limits = await Promise.all([
      checkRateLimit(`invite:ip:${clientIp(req)}`, INVITE_ATTEMPT_LIMIT),
      checkRateLimit(`invite:token:${tokenHash}`, INVITE_ATTEMPT_LIMIT),
    ])
    const limited = limits.find((item) => item.limited)
    if (limited) {
      return NextResponse.json({ ok: false, error: 'too_many_attempts' }, { status: 429 })
    }
    if (!body.password || body.password.length < 12) {
      return NextResponse.json({ ok: false, error: 'password_too_short' }, { status: 400 })
    }

    const found = await findValid(body.token ?? null)
    if (!found.ok) return found.res
    const inv = found.invitation
    const user = await prisma.user.findUnique({ where: { id: inv.userId } })
    if (!user) return NextResponse.json({ ok: false, error: 'user_not_found' }, { status: 404 })

    const passwordHash = await hashPassword(body.password)
    const companyId = user.companyId ?? `company_master_${randomUUID()}`
    const companyName = user.name || inv.email

    try {
      await prisma.$transaction(async (tx) => {
        // The conditional update is the single atomic consume operation. Concurrent
        // activation attempts cannot both move the same row out of `sent`.
        const consumed = await tx.invitationToken.updateMany({
          where: {
            tokenHash: hashInviteToken(body.token!),
            status: 'sent',
            acceptedAt: null,
            expiresAt: { gt: new Date() },
          },
          data: { status: 'accepted', acceptedAt: new Date() },
        })
        if (consumed.count !== 1) throw new InviteConsumedError()

        if (!user.companyId) {
          const cardTaken = await tx.company.findUnique({ where: { cardNumber: inv.cardNumber }, select: { id: true } })
          await tx.company.create({ data: { id: companyId, companyName, cardNumber: cardTaken ? null : inv.cardNumber } })
          await tx.companyMember.create({
            data: {
              id: randomUUID(), companyId, userId: user.id, email: inv.email,
              name: user.name ?? inv.email, role: 'admin', addedBy: 'invitation',
            },
          })
        }
        await tx.user.update({
          where: { id: user.id },
          data: {
            passwordHash, mustChangePassword: false, cardNumber: inv.cardNumber,
            companyId, companyName, teamRole: 'admin',
          },
        })
        await tx.session.deleteMany({ where: { userId: user.id } })
      }, { isolationLevel: 'Serializable' })
    } catch (error) {
      if (error instanceof InviteConsumedError || (error as { code?: string })?.code === 'P2034') {
        return NextResponse.json({ ok: false, error: 'already_used' }, { status: 409 })
      }
      throw error
    }

    const sessionToken = await createSession(user.id)
    const res = NextResponse.json({ ok: true, email: inv.email })
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (error) {
    console.error('[auth/invite POST]', error)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}
