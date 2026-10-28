import { after, NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { getClientIp } from '@/lib/request-ip'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'
import { resolveInviteLang } from '@/lib/invitations'
import { findCardActivationCandidate, isCardActivationEligible, sendCardActivationInvite } from '@/lib/card-activation'

export const runtime = 'nodejs'

// One answer for every card: unknown, already activated, staff, no usable e-mail or a link sent.
// Status and body must never depend on the card, or the form becomes a card/contact oracle.
const ACCEPTED = { ok: true }

function tooManyAttempts(resetAt: number): NextResponse {
  return NextResponse.json(
    { error: 'too_many_attempts', resetAt },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } },
  )
}

/**
 * Self-service activation for a client card ("Есть карта клиента", RegisterForm). Knowing a card
 * number — or the phone/e-mail stored with it — proves nothing, so this route never activates an
 * account, sets a password or opens a session. For an eligible card it mails a one-time
 * invitation to the address already on file; the cardholder finishes in /api/auth/invite.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    if (Math.random() < 0.05) void gcRateLimitStore()

    const ipLimit = await checkRateLimit(`register-card:${getClientIp(req)}`)
    if (ipLimit.limited) return tooManyAttempts(ipLimit.resetAt)

    const body = (await req.json().catch(() => null)) as { cardNumber?: unknown; language?: unknown; privacyAcknowledged?: unknown } | null
    if (body?.privacyAcknowledged !== true) {
      return NextResponse.json({ error: 'privacy_acknowledgement_required' }, { status: 400 })
    }
    const cardNumber = normalizeCardNumber(typeof body.cardNumber === 'string' ? body.cardNumber : '')
    if (!cardNumber) return NextResponse.json({ error: 'card_required' }, { status: 400 })
    if (!isValidCardNumber(cardNumber)) return NextResponse.json({ error: 'invalid_card' }, { status: 400 })

    // Counted before the lookup, so a limited answer says nothing about whether the card exists.
    const cardLimit = await checkRateLimit(`register-card:card:${cardNumber}`, { windowMs: 60 * 60 * 1000, maxAttempts: 5 })
    if (cardLimit.limited) return tooManyAttempts(cardLimit.resetAt)

    const candidate = await findCardActivationCandidate(cardNumber)
    if (isCardActivationEligible(candidate)) {
      const language = resolveInviteLang(typeof body.language === 'string' ? body.language : undefined)
      // Token creation and SMTP run after the response, so its timing does not reveal eligibility.
      // The long-lived server.js process provides waitUntil; should after() ever be unavailable it
      // throws synchronously, and a 500 for eligible cards only would be an oracle — run it unawaited
      // instead (sendCardActivationInvite never throws).
      try {
        after(() => sendCardActivationInvite(candidate, language))
      } catch (error) {
        logApiError('[auth/register-card] after() unavailable, sending without it', error)
        void sendCardActivationInvite(candidate, language)
      }
    }
    return NextResponse.json(ACCEPTED, { status: 202 })
  } catch (e) {
    logApiError('[auth/register-card]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
