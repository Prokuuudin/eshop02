import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword, createSession, mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { FIRST_LOGIN_PASSWORD } from '@/lib/auth-constants'

export const runtime = 'nodejs'

const normalizeCard = (v: string): string => v.trim().replace(/\s+/g, '').toUpperCase()

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Registers/activates a cardholder against a real card number — the only
 * server-authoritative path for "register with client card" (RegisterForm).
 * Every cardholder shares the same onboarding password (FIRST_LOGIN_PASSWORD);
 * its only job is to gate them into the forced "set your own password" screen
 * (mustChangePassword). Two cardholder shapes exist and are checked in order:
 *
 *  1. An individual already has a User row with this cardNumber — either a
 *     dormant ERP import (Klienti.xlsx, see scripts/import-client-cards.ts)
 *     or a company member created by this route before. We log them in
 *     rather than creating a duplicate; mustChangePassword tells us whether
 *     they already picked their own password (then this card is "taken").
 *  2. Otherwise, the card may belong to a Company with no User yet (new B2B
 *     team member claiming a shared company card) — create one.
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
    const password = typeof body.password === 'string' ? body.password : ''
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined

    if (!cardNumber) {
      return NextResponse.json({ error: 'card_required' }, { status: 400 })
    }

    const cardUser = await prisma.user.findFirst({
      where: { cardNumber: { equals: cardNumber, mode: 'insensitive' } },
    })

    if (cardUser) {
      if (!cardUser.mustChangePassword) {
        return NextResponse.json({ error: 'card_already_registered' }, { status: 409 })
      }
      if (password !== FIRST_LOGIN_PASSWORD) {
        return NextResponse.json({ error: 'wrong_password' }, { status: 401 })
      }

      const token = await createSession(cardUser.id)
      const res = NextResponse.json({ user: mapDbToServerUser(cardUser) }, { status: 200 })
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
      return res
    }

    const company = await prisma.company.findFirst({
      where: { cardNumber: { equals: cardNumber, mode: 'insensitive' } },
    })
    if (!company) {
      return NextResponse.json({ error: 'card_not_found' }, { status: 404 })
    }
    if (password !== FIRST_LOGIN_PASSWORD) {
      return NextResponse.json({ error: 'wrong_password' }, { status: 401 })
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
