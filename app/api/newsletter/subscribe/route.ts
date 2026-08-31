import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { subscribeToNewsletter } from '@/lib/newsletter-store'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/request-ip'

export const runtime = 'nodejs'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX_LENGTH = 160

export async function POST(req: NextRequest): Promise<Response> {
  try {
    if (Math.random() < 0.05) void gcRateLimitStore()

    const ip = getClientIp(req)
    const rl = await checkRateLimit(`newsletter:${ip}`)
    if (rl.limited) {
      return NextResponse.json(
        { ok: false, error: 'rate_limited', resetAt: rl.resetAt },
        { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
      )
    }

    const body = (await req.json()) as { email?: string; consent?: boolean }
    const email = body.email?.trim() ?? ''

    if (!EMAIL_RE.test(email) || email.length > EMAIL_MAX_LENGTH) {
      return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 400 })
    }
    if (body.consent !== true) {
      return NextResponse.json({ ok: false, error: 'consent_required' }, { status: 400 })
    }

    await subscribeToNewsletter(email)
    return NextResponse.json({ ok: true })
  } catch (error) {
    logApiError("[newsletter/subscribe]", error)
    return NextResponse.json({ ok: false, error: 'server_error' }, { status: 500 })
  }
}

