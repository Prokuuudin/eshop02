import { randomUUID } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { sendEmail } from '@/lib/mailer'
import { isTurnstileRequired, TurnstileConfigurationError, verifyTurnstile } from '@/lib/turnstile-server'
import { checkRateLimit } from '@/lib/rate-limit'
import { prisma } from '@/lib/prisma'

type ContactPayload = {
  name: string
  email: string
  subject: string
  message: string
  website?: string
  submittedAt?: number
  turnstileToken?: string
}

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000
const RATE_LIMIT_MAX_REQUESTS = 5
const CONTACT_LIMIT = { windowMs: RATE_LIMIT_WINDOW_MS, maxAttempts: RATE_LIMIT_MAX_REQUESTS }

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const runtime = 'nodejs'

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) {
    return forwardedFor.split(',')[0]?.trim() || 'unknown'
  }

  return request.headers.get('x-real-ip') ?? 'unknown'
}

function rateLimitedResponse(resetAt: number): NextResponse {
  const retryAfter = Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))
  return NextResponse.json(
    { ok: false, code: 'rate_limited', retryAfter },
    { status: 429, headers: { 'Retry-After': String(retryAfter) } },
  )
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

export async function POST(request: NextRequest): Promise<NextResponse> {
  let captchaRequired: boolean
  try {
    captchaRequired = isTurnstileRequired()
  } catch (error) {
    if (error instanceof TurnstileConfigurationError) {
      return NextResponse.json({ ok: false, code: 'captcha_not_configured' }, { status: 503 })
    }
    throw error
  }

  const ip = getClientIp(request)
  const ipLimit = await checkRateLimit(`contact:ip:${ip}`, CONTACT_LIMIT)
  if (ipLimit.limited) return rateLimitedResponse(ipLimit.resetAt)

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

  const normalizedEmail = payload.email.trim().toLowerCase()
  const emailLimit = await checkRateLimit(`contact:email:${normalizedEmail}`, CONTACT_LIMIT)
  if (emailLimit.limited) return rateLimitedResponse(emailLimit.resetAt)

  if (captchaRequired) {
    const token = (payload.turnstileToken ?? '').trim()
    if (!token) {
      return NextResponse.json({ ok: false, code: 'captcha_required' }, { status: 400 })
    }

    const captchaValid = await verifyTurnstile(token, ip)
    if (!captchaValid) {
      return NextResponse.json({ ok: false, code: 'captcha_failed' }, { status: 400 })
    }
  }

  // Persist first so the submission survives even if the notification email
  // fails or SMTP isn't configured — previously the only record of a lead was
  // an outbound email, and a delivery failure silently lost it while the
  // client was still told "sent".
  const record = await prisma.contactMessage.create({
    data: {
      id: randomUUID(),
      name: payload.name.trim(),
      email: normalizedEmail,
      subject: payload.subject.trim(),
      message: payload.message.trim(),
      ipAddress: ip,
      emailStatus: 'pending',
    },
  })

  const adminEmail = (process.env.CONTACT_TO ?? process.env.SMTP_USER ?? '').trim()
  if (adminEmail) {
    try {
      await sendEmail(
        adminEmail,
        `[Контакт] ${payload.subject.trim()}`,
        `<div style="font-family:sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#4f46e5;margin-bottom:16px">Новое сообщение с сайта</h2>
          <table style="width:100%;border-collapse:collapse;font-size:14px">
            <tr><td style="padding:8px 12px;color:#6b7280;width:100px;vertical-align:top">Имя</td><td style="padding:8px 12px">${escapeHtml(payload.name.trim())}</td></tr>
            <tr style="background:#f9fafb"><td style="padding:8px 12px;color:#6b7280;vertical-align:top">Email</td><td style="padding:8px 12px"><a href="mailto:${escapeHtml(normalizedEmail)}">${escapeHtml(normalizedEmail)}</a></td></tr>
            <tr><td style="padding:8px 12px;color:#6b7280;vertical-align:top">Тема</td><td style="padding:8px 12px">${escapeHtml(payload.subject.trim())}</td></tr>
          </table>
          <div style="margin-top:16px;padding:16px;background:#f9fafb;border-radius:6px;font-size:14px;white-space:pre-wrap">${escapeHtml(payload.message.trim())}</div>
        </div>`
      )
      await prisma.contactMessage.update({ where: { id: record.id }, data: { emailStatus: 'sent' } })
    } catch (err) {
      logApiError("[contact] sendEmail error:", err)
      await prisma.contactMessage.update({
        where: { id: record.id },
        data: { emailStatus: 'failed', emailError: err instanceof Error ? err.message.slice(0, 500) : 'unknown_error' },
      }).catch((updateErr) => logApiError('[contact] failed to record email failure', updateErr))
    }
  } else {
    await prisma.contactMessage.update({ where: { id: record.id }, data: { emailStatus: 'not_configured' } })
      .catch((err) => logApiError('[contact] failed to record not_configured status', err))
  }

  return NextResponse.json({ ok: true })
}





