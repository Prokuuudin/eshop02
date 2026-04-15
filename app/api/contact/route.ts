import { NextRequest, NextResponse } from 'next/server'

type RateLimitRecord = {
  count: number
  resetAt: number
}

type ContactPayload = {
  name: string
  email: string
  subject: string
  message: string
  website?: string
  submittedAt?: number
  turnstileToken?: string
}

type TurnstileResponse = {
  success: boolean
  'error-codes'?: string[]
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 5

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const globalStore = globalThis as typeof globalThis & {
  __contactRateLimitStore?: Map<string, RateLimitRecord>
}

const rateLimitStore = globalStore.__contactRateLimitStore ?? new Map<string, RateLimitRecord>()
if (!globalStore.__contactRateLimitStore) {
  globalStore.__contactRateLimitStore = rateLimitStore
}

export const runtime = 'nodejs'

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }

  return request.headers.get('x-real-ip') ?? 'unknown'
}

function consumeRateLimit(ip: string): { limited: boolean; retryAfter: number } {
  const now = Date.now()
  const current = rateLimitStore.get(ip)

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(ip, {
      count: 1,
      resetAt: now + RATE_LIMIT_WINDOW_MS
    })

    return { limited: false, retryAfter: 0 }
  }

  if (current.count >= RATE_LIMIT_MAX_REQUESTS) {
    return {
      limited: true,
      retryAfter: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
    }
  }

  current.count += 1
  rateLimitStore.set(ip, current)

  return { limited: false, retryAfter: 0 }
}

function validatePayload(payload: ContactPayload, nowMs: number): string | null {
  if (typeof payload.name !== 'string' || payload.name.trim().length < 2 || payload.name.trim().length > 80) {
    return 'invalid_name'
  }

  if (typeof payload.email !== 'string' || !EMAIL_REGEX.test(payload.email.trim()) || payload.email.trim().length > 160) {
    return 'invalid_email'
  }

  if (typeof payload.subject !== 'string' || payload.subject.trim().length < 3 || payload.subject.trim().length > 140) {
    return 'invalid_subject'
  }

  if (typeof payload.message !== 'string' || payload.message.trim().length < 10 || payload.message.trim().length > 5000) {
    return 'invalid_message'
  }

  if (typeof payload.website === 'string' && payload.website.trim().length > 0) {
    return 'spam_detected'
  }

  if (!Number.isFinite(payload.submittedAt)) {
    return 'invalid_timing'
  }

  const elapsed = nowMs - Number(payload.submittedAt)
  if (elapsed < 1500 || elapsed > 2 * 60 * 60 * 1000) {
    return 'spam_detected'
  }

  return null
}

async function verifyTurnstile(token: string, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    return true
  }

  const formData = new URLSearchParams()
  formData.set('secret', secret)
  formData.set('response', token)
  if (ip && ip !== 'unknown') {
    formData.set('remoteip', ip)
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: formData.toString()
    })

    if (!response.ok) {
      return false
    }

    const result = (await response.json()) as TurnstileResponse
    return Boolean(result.success)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request)
  const rateLimit = consumeRateLimit(ip)

  if (rateLimit.limited) {
    return NextResponse.json(
      { ok: false, code: 'rate_limited', retryAfter: rateLimit.retryAfter },
      {
        status: 429,
        headers: {
          'Retry-After': String(rateLimit.retryAfter)
        }
      }
    )
  }

  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) {
        return NextResponse.json({ ok: false, code: 'invalid_origin' }, { status: 403 })
      }
    } catch {
      return NextResponse.json({ ok: false, code: 'invalid_origin' }, { status: 403 })
    }
  }

  let payload: ContactPayload
  try {
    payload = (await request.json()) as ContactPayload
  } catch {
    return NextResponse.json({ ok: false, code: 'invalid_json' }, { status: 400 })
  }

  const nowMs = Date.now()
  const validationError = validatePayload(payload, nowMs)
  if (validationError) {
    const status = validationError === 'spam_detected' ? 400 : 422
    return NextResponse.json({ ok: false, code: validationError }, { status })
  }

  if (process.env.TURNSTILE_SECRET_KEY) {
    const token = (payload.turnstileToken ?? '').trim()
    if (!token) {
      return NextResponse.json({ ok: false, code: 'captcha_required' }, { status: 400 })
    }

    const captchaValid = await verifyTurnstile(token, ip)
    if (!captchaValid) {
      return NextResponse.json({ ok: false, code: 'captcha_failed' }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}
