import { after, NextRequest, NextResponse } from 'next/server'
import { hasDeliverableEmail } from '@/lib/card-activation'
import { buildEmailChangedNoticeMail, confirmEmailChange } from '@/lib/email-change'
import { sendEmail } from '@/lib/mailer'
import { logApiError } from '@/lib/observability'
import { checkRateLimit } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/request-ip'
import { hashToken, SESSION_COOKIE } from '@/lib/server-auth'

export const runtime = 'nodejs'

const CONFIRM_LIMIT = { windowMs: 15 * 60 * 1000, maxAttempts: 20 }

// POST only, and there is deliberately no GET: mail scanners and link previews open links, and
// opening one must change nothing. The token authorizes the change, so no session is required and
// none is created. Used, expired, tampered, voided or now-taken links all get the same answer.
export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const limit = await checkRateLimit(`email-change-confirm:ip:${getClientIp(req)}`, CONFIRM_LIMIT)
    if (limit.limited) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const body = await req.json().catch(() => null) as { token?: unknown } | null
    const token = typeof body?.token === 'string' && body.token.length <= 512 ? body.token : ''
    const sessionToken = req.cookies.get(SESSION_COOKIE)?.value
    const changed = token ? await confirmEmailChange(token, req, sessionToken ? hashToken(sessionToken) : null) : null
    if (!changed) return NextResponse.json({ error: 'invalid_link' }, { status: 400 })

    if (hasDeliverableEmail(changed.oldEmail)) {
      const notify = async (): Promise<void> => {
        const { subject, html } = buildEmailChangedNoticeMail(changed.newEmail, changed.language)
        await sendEmail(changed.oldEmail, subject, html).catch((error) => logApiError('[user/email-change/confirm] notice mail failed', error))
      }
      try {
        after(notify)
      } catch (error) {
        logApiError('[user/email-change/confirm] after() unavailable, sending without it', error)
        void notify()
      }
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    logApiError('[user/email-change/confirm POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
