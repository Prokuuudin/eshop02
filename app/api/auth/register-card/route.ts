import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getClientIp } from '@/lib/request-ip'
import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword, createSession, mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/mailer'
import { buildCardActivatedEmail } from '@/lib/invitation-emails'
import { getTemplates } from '@/lib/email-templates-server-store'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'
import { grantWelcomeBonus } from '@/lib/bonus-ledger'

// Synthetic placeholder assigned when no real email is on file (see
// accountEmail() in scripts/import-client-cards.ts) — it's derived from the
// card number itself, so treating it as a valid match would let anyone who
// knows the card number "verify" the email factor for free.
const isSyntheticClientEmail = (email: string): boolean => email.toLowerCase().endsWith('@client.local')

/** Digits-only last 4, or '' if fewer than 4 digits are present (never matches). */
function phoneLast4(value: string): string {
  const digits = value.replace(/\D/g, '')
  return digits.length >= 4 ? digits.slice(-4) : ''
}

// Best-effort "was this you?" notice נan attacker could have guessed the
// phone-last-4/email combination, so this activation might not be the real
// owner. Never let a mail failure break the response the browser is waiting on.
async function notifyCardActivated(email: string | null | undefined, name: string, cardNumber: string): Promise<void> {
  if (!email) return
  try {
    // A template-store outage must not suppress this security notification.
    const templates = await getTemplates().catch(() => [])
    const tpl = templates.find((template) => template.id === 'card-activated')
    const { subject, html } = buildCardActivatedEmail(
      { name, cardNumber },
      tpl ? { subject: tpl.subject, body: tpl.body } : undefined,
    )
    await sendEmail(email, subject, html)
  } catch (e) {
    logApiError("[auth/register-card] activation notice failed", e)
  }
}

export const runtime = 'nodejs'
const PRIVACY_NOTICE_VERSION = '2026-07-03'

/**
 * Registers/activates a cardholder against a real card number נthe only
 * server-authoritative path for "register with client card" (RegisterForm).
 * Two cardholder shapes exist and are checked in order:
 *
 *  1. An individual already has a User row with this cardNumber נeither a
 *     dormant ERP import (Klienti.xlsx, see scripts/import-client-cards.ts)
 *     or a company member created by this route before. Verified against
 *     the last 4 digits of `phone` and/or `email` on file for that
 *     cardholder נsourced from the client database, matched independently:
 *     either one matching (or both) is sufficient. `mustChangePassword`
 *     tells us whether they've already picked their own password (then this
 *     card is "taken"); no usable contact on file at all (no phone, and
 *     email is missing or only the synthetic `card.<n>@client.local`
 *     placeholder) routes to the manual no-card request flow client-side.
 *     Note: activation itself sets `mustChangePassword: true` (the phone/email
 *     used to get in is a one-time credential, not fit to stand as the account's
 *     permanent password) — so this gate only closes once the cardholder picks
 *     their own password via /api/user/password, not at the moment of activation.
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
    const submittedPhoneLast4 = phoneLast4(typeof body.phoneLast4 === 'string' ? body.phoneLast4 : '')
    const submittedEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
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
    // specific card's phone-last-4/email from a fresh IP נcap attempts per
    // card too.
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
      if (!submittedPhoneLast4 && !submittedEmail) {
        return NextResponse.json({ error: 'contact_required' }, { status: 400 })
      }

      const storedPhoneLast4 = phoneLast4(cardUser.phone ?? '')
      const storedEmail = cardUser.email.toLowerCase()
      const hasUsableEmail = storedEmail !== ''
        && !isSyntheticClientEmail(storedEmail)
        && !storedEmail.endsWith('@deleted.invalid')
      const recoveryEmailHash = cardUser.cardRecoveryEmailHash
      const recoveryPhoneHash = cardUser.cardRecoveryPhoneHash
      if (!storedPhoneLast4 && !hasUsableEmail && !recoveryEmailHash && !recoveryPhoneHash) {
        return NextResponse.json({ error: 'no_contact_on_file' }, { status: 422 })
      }

      const phoneMatches = submittedPhoneLast4 !== '' && (
        submittedPhoneLast4 === storedPhoneLast4
        || Boolean(recoveryPhoneHash && await verifyPassword(`phone-last4:${submittedPhoneLast4}`, recoveryPhoneHash))
      )
      const emailMatches = submittedEmail !== '' && (
        (hasUsableEmail && submittedEmail === storedEmail)
        || Boolean(recoveryEmailHash && await verifyPassword(`email:${submittedEmail}`, recoveryEmailHash))
      )
      if (!phoneMatches && !emailMatches) {
        return NextResponse.json({ error: 'wrong_contact' }, { status: 401 })
      }

      const recoveredEmail = emailMatches && recoveryEmailHash ? submittedEmail : undefined
      // Keep the contact value that proved ownership as a one-time activation password —
      // it's low-entropy (a 4-digit phone suffix) or not secret at all (the client's own
      // email), so it must never become the account's standing credential. Force a real
      // password to be chosen on the very next action, same as every other first-login path.
      const activationPassword = phoneMatches ? submittedPhoneLast4 : submittedEmail
      const activationPasswordHash = await hashPassword(activationPassword)
      const activatedUser = await prisma.$transaction(async (tx) => {
        const updated = await tx.user.update({
          where: { id: cardUser.id },
          data: {
            ...privacyData,
            ...(name ? { name } : {}),
            ...(recoveredEmail ? { email: recoveredEmail } : {}),
            passwordHash: activationPasswordHash,
            mustChangePassword: true,
            cardRecoveryEmailHash: null,
            cardRecoveryPhoneHash: null,
          },
        })
        await grantWelcomeBonus(tx, cardUser.id)
        return updated
      })
      await notifyCardActivated(recoveredEmail ?? cardUser.email, activatedUser.name ?? '', cardNumber)
      const token = await createSession(cardUser.id)
      const res = NextResponse.json({ user: mapDbToServerUser(activatedUser) }, { status: 200 })
      res.cookies.set(SESSION_COOKIE, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 60 * 60 * 24 * 30,
      })
      return res
    }

    return NextResponse.json({ error: 'card_not_found' }, { status: 404 })

  } catch (e) {
    if ((e as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'card_already_registered' }, { status: 409 })
    }
    logApiError("[auth/register-card]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
