import { after, NextRequest, NextResponse } from 'next/server'
import { guardOrigin } from '@/lib/api-guard'
import {
  buildEmailChangeConfirmMail,
  normalizeRequestedEmail,
  requestEmailChange,
  resolveEmailChangeLanguage,
} from '@/lib/email-change'
import { sendEmail } from '@/lib/mailer'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/request-ip'
import { getServerUser, verifyPassword } from '@/lib/server-auth'

export const runtime = 'nodejs'

const HOUR = 60 * 60 * 1000
const USER_LIMIT = { windowMs: HOUR, maxAttempts: 5 }
const IP_LIMIT = { windowMs: HOUR, maxAttempts: 20 }
const TARGET_LIMIT = { windowMs: HOUR, maxAttempts: 3 }
const MAX_BODY_BYTES = 4096

const tooMany = (resetAt: number): NextResponse => NextResponse.json({ error: 'rate_limited' }, {
  status: 429,
  headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) },
})

// POST /api/user/email-change: starts a change, nothing about the account changes here.
// The same 202 answers a free and a taken address; the link goes only to a free one, after the
// response, so neither the status nor the timing reveals whether someone else holds that address.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    }

    // Before bcrypt, and counting failures: this also limits guessing the current password.
    const [userLimit, ipLimit] = await Promise.all([
      checkRateLimit(`email-change:user:${user.id}`, USER_LIMIT),
      checkRateLimit(`email-change:ip:${getClientIp(req)}`, IP_LIMIT),
    ])
    const limited = [userLimit, ipLimit].find((result) => result.limited)
    if (limited) return tooMany(limited.resetAt)

    const body = await req.json().catch(() => null) as { newEmail?: unknown; currentPassword?: unknown; language?: unknown } | null
    const newEmail = normalizeRequestedEmail(body?.newEmail)
    if (!newEmail) return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    if (newEmail === user.email.toLowerCase()) return NextResponse.json({ error: 'email_unchanged' }, { status: 400 })

    const currentPassword = body?.currentPassword
    if (typeof currentPassword !== 'string' || !currentPassword || currentPassword.length > 128) {
      return NextResponse.json({ error: 'reauthentication_failed' }, { status: 401 })
    }
    const credentials = await prisma.user.findUnique({ where: { id: user.id }, select: { passwordHash: true } })
    if (!credentials || !(await verifyPassword(currentPassword, credentials.passwordHash))) {
      return NextResponse.json({ error: 'reauthentication_failed' }, { status: 401 })
    }

    // Keyed by the address, so links cannot be used to flood one mailbox from many accounts.
    const targetLimit = await checkRateLimit(`email-change:target:${newEmail}`, TARGET_LIMIT)
    if (targetLimit.limited) return tooMany(targetLimit.resetAt)

    const language = resolveEmailChangeLanguage(body?.language)
    const { token } = await requestEmailChange(user, newEmail, language)
    if (token) {
      const deliver = async (): Promise<void> => {
        const { subject, html } = buildEmailChangeConfirmMail(token, language)
        await sendEmail(newEmail, subject, html).catch((error) => logApiError('[user/email-change] confirmation mail failed', error))
      }
      try {
        after(deliver)
      } catch (error) {
        logApiError('[user/email-change] after() unavailable, sending without it', error)
        void deliver()
      }
    }
    return NextResponse.json({ ok: true }, { status: 202 })
  } catch (error) {
    logApiError('[user/email-change POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
