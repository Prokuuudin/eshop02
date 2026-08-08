import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword, createSession, mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { FIRST_LOGIN_PASSWORD } from '@/lib/auth-constants'
import { sendEmail } from '@/lib/mailer'
import { buildCardActivatedEmail } from '@/lib/invitation-emails'
import { normalizeSubmittedCode } from '@/lib/personal-code'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'

// Best-effort "was this you?" notice נan attacker could have guessed the
// 3-character personal code, so this activation might not be the real owner.
// Never let a mail failure break the response the browser is waiting on.
async function notifyCardActivated(email: string | null | undefined, name: string, cardNumber: string): Promise<void> {
  if (!email) return
  try {
    const { subject, html } = buildCardActivatedEmail({ name, cardNumber })
    await sendEmail(email, subject, html)
  } catch (e) {
    logApiError("[auth/register-card] activation notice failed", e)
  }
}

export const runtime = 'nodejs'
const PRIVACY_NOTICE_VERSION = '2026-07-03'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Registers/activates a cardholder against a real card number נthe only
 * server-authoritative path for "register with client card" (RegisterForm).
 * Two cardholder shapes exist and are checked in order:
 *
 *  1. An individual already has a User row with this cardNumber נeither a
 *     dormant ERP import (Klienti.xlsx, see scripts/import-client-cards.ts)
 *     or a company member created by this route before. Verified against
 *     `pkLast3` נthe last 3 characters of that person's personal code, or
 *     for a card issued to a legal entity, their company registration
 *     number נsourced from the client database, unique per cardholder
 *     (never a value shared across cards). `mustChangePassword` tells us
 *     whether they've already picked their own password (then this card is
 *     "taken"); `pkLast3 === null` means this card has no code on file at
 *     all (routed to the manual no-card request flow client-side).
 *  2. Otherwise, the card may belong to a Company with no User yet (new B2B
 *     team member claiming a shared company card) נcreate one, gated by
 *     the shared FIRST_LOGIN_PASSWORD mailed to the company contact.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
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
    const cardNumber = normalizeCardNumber(String(body.cardNumber ?? ''))
    const password = typeof body.password === 'string' ? body.password : ''
    const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : undefined
    if (body.privacyAcknowledged !== true) {
      return NextResponse.json({ error: 'privacy_acknowledgement_required' }, { status: 400 })
    }
    const privacyData = {
      privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
      privacyAcknowledgedAt: new Date(),
      marketingConsent: body.marketingConsent === true,
      marketingConsentAt: body.marketingConsent === true ? new Date() : null,
    }

    if (!cardNumber) {
      return NextResponse.json({ error: 'card_required' }, { status: 400 })
    }
    if (!isValidCardNumber(cardNumber)) {
      return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
    }

    // Per-IP limiting alone doesn't stop a targeted attempt to guess one
    // specific card's 3-character personal code from a fresh IP נcap
    // attempts per card too.
    const cardRl = await checkRateLimit(`register-card:card:${cardNumber}`, { windowMs: 60 * 60 * 1000, maxAttempts: 5 })
    if (cardRl.limited) {
      return NextResponse.json(
        { error: 'too_many_attempts', resetAt: cardRl.resetAt },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((cardRl.resetAt - Date.now()) / 1000)) } }
      )
    }

    const cardUser = await prisma.user.findFirst({
      where: { cardNumber: { equals: cardNumber, mode: 'insensitive' } },
    })

    if (cardUser) {
      if (!cardUser.mustChangePassword) {
        return NextResponse.json({ error: 'card_already_registered' }, { status: 409 })
      }
      if (!cardUser.pkLast3) {
        return NextResponse.json({ error: 'no_personal_code_on_file' }, { status: 422 })
      }
      if (normalizeSubmittedCode(password) !== cardUser.pkLast3) {
        return NextResponse.json({ error: 'wrong_code' }, { status: 401 })
      }

      await prisma.user.update({ where: { id: cardUser.id }, data: privacyData })
      await notifyCardActivated(cardUser.email, cardUser.name ?? '', cardNumber)
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
    if (!FIRST_LOGIN_PASSWORD) {
      logApiError('auth_register_card_not_configured')
      return NextResponse.json({ error: 'registration_not_configured' }, { status: 503 })
    }
    if (password !== FIRST_LOGIN_PASSWORD) {
      return NextResponse.json({ error: 'wrong_password' }, { status: 401 })
    }

    const contactEmail = company.contactEmail?.trim().toLowerCase()
    const contactEmailOwner = contactEmail
      ? await prisma.user.findFirst({
          where: { email: { equals: contactEmail, mode: 'insensitive' } },
          select: { id: true },
        })
      : null
    const email = contactEmail && !contactEmailOwner
      ? contactEmail
      : `card.${cardNumber.toLowerCase()}@client.local`
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
          ...privacyData,
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

    // The user's own email is the synthetic card.<number>@client.local
    // placeholder, not a real inbox נnotify the company's contact address.
    await notifyCardActivated(company.contactEmail, user.name ?? '', cardNumber)
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
    logApiError("[auth/register-card]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}




