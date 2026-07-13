import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword, createSession, mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const FIRST_LOGIN_PASSWORD =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_FIRST_LOGIN_PASSWORD) || 'Welcome1!'

const normalizeCard = (v: string): string => v.trim().replace(/\s+/g, '').toUpperCase()

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Registers a B2B customer against a real Company.cardNumber — this is the
 * only server-authoritative path for "register with company card" (RegisterForm).
 * A locally-faked account would be invisible to every other endpoint that
 * checks getServerUser(), so this must create a real User + session here.
 */
export async function POST(req: NextRequest) {
  try {
    if (Math.random() < 0.05) void gcRateLimitStore()

    const ip = getClientIp(req)
    const rl = await checkRateLimit(`register-card:${ip}`)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'too_many_attempts', resetAt: rl.resetAt },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      )
    }

    const body = await req.json()
    const cardNumber = normalizeCard(String(body.cardNumber ?? ''))
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined

    if (!cardNumber) {
      return NextResponse.json({ error: 'card_required' }, { status: 400 })
    }

    const company = await prisma.company.findFirst({
      where: { cardNumber: { equals: cardNumber, mode: 'insensitive' } },
    })
    if (!company) {
      return NextResponse.json({ error: 'card_not_found' }, { status: 404 })
    }

    const existingCardUser = await prisma.user.findFirst({
      where: { cardNumber: { equals: cardNumber, mode: 'insensitive' } },
      select: { id: true },
    })
    if (existingCardUser) {
      return NextResponse.json({ error: 'card_already_registered' }, { status: 409 })
    }

    const email = `card.${cardNumber.toLowerCase()}@client.local`
    const passwordHash = await hashPassword(FIRST_LOGIN_PASSWORD)
    const userId = randomUUID()

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          id: userId,
          email,
          passwordHash,
          name: name ?? null,
          cardNumber,
          platformRole: 'customer',
          companyId: company.id,
          companyName: company.companyName,
          teamRole: 'buyer',
          approvalRequired: company.approvalWorkflowEnabled,
          auditLoggingEnabled: true,
          mustChangePassword: true,
        },
      })

      await tx.companyMember.create({
        data: {
          id: randomUUID(),
          companyId: company.id,
          userId: created.id,
          email: created.email,
          role: 'buyer',
          name: name || cardNumber,
        },
      })

      return created
    })

    const token = await createSession(user.id)

    const res = NextResponse.json({ user: mapDbToServerUser(user) }, { status: 201 })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'card_already_registered' }, { status: 409 })
    }
    console.error('[auth/register-card]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
