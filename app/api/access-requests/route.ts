import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import {
  cleanupExpiredCertificates,
  parseDataUrl,
  saveCertificate,
  MAX_CERT_DATA_LENGTH,
} from '@/lib/certificate-store'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'
import { isTurnstileRequired, TurnstileConfigurationError, verifyTurnstile } from '@/lib/turnstile-server'
import { isValidCardNumber, normalizeCardNumber } from '@/lib/card-number'
import { sendEmail } from '@/lib/mailer'
import { escapeHtml } from '@/lib/escape-html'
import { getSiteUrl } from '@/lib/site-url'

export const runtime = 'nodejs'

type AdminNoticeInput = {
  requestType: 'card' | 'no-card'
  email: string
  name?: string | null
  phone?: string | null
  companyName?: string | null
  companyId?: string | null
  cardNumber?: string | null
  language?: string | null
  message?: string | null
  hasCertificate: boolean
}

// Best-effort notice to the shop admin (same CONTACT_TO inbox as new orders).
// The request is already persisted, so a mail failure must never fail the response.
async function notifyAdminOfAccessRequest(input: AdminNoticeInput): Promise<void> {
  const adminEmail = process.env.CONTACT_TO
  if (!adminEmail) return
  try {
    const isNoCard = input.requestType === 'no-card'
    const typeLabel = isNoCard ? 'Без карты клиента' : 'С картой клиента'
    let adminUrl = ''
    try {
      adminUrl = `${getSiteUrl()}/admin/client-barcodes`
    } catch {
      // Site URL not configured — send the notice without a link.
    }
    const row = (label: string, value?: string | null) =>
      value?.trim()
        ? `<tr><td style="padding:4px 8px;color:#666">${label}</td><td style="padding:4px 8px">${escapeHtml(value.trim())}</td></tr>`
        : ''
    const html = `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
  <h2 style="margin:0 0 12px">Новая заявка на доступ</h2>
  <table style="border-collapse:collapse">
    ${row('Тип', typeLabel)}
    ${row('Имя', input.name)}
    ${row('E-mail', input.email)}
    ${row('Телефон', input.phone)}
    ${row('Компания', input.companyName)}
    ${row('Рег. номер', input.companyId)}
    ${row('Карта клиента', input.cardNumber)}
    ${row('Язык', input.language)}
    ${row('Сертификат', input.hasCertificate ? 'приложен' : '')}
    ${row('Сообщение', input.message)}
  </table>
  ${adminUrl ? `<p style="margin-top:16px"><a href="${escapeHtml(adminUrl)}">Открыть заявки в админке</a></p>` : ''}
</div>`
    const who = (input.name?.trim() || input.email).replace(/[\r\n]+/g, ' ')
    await sendEmail(adminEmail, `Новая заявка на доступ (${typeLabel.toLowerCase()}) — ${who}`, html)
  } catch (error) {
    logApiError('[access-requests] admin notification failed', error)
  }
}

const ACCESS_REQUEST_LIMIT = { windowMs: 60 * 60 * 1000, maxAttempts: 3 }
const PRIVACY_NOTICE_VERSION = '2026-07-03'

const clientIp = (req: NextRequest): string =>
  req.headers.get('cf-connecting-ip')?.trim()
  || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  || req.headers.get('x-real-ip')?.trim()
  || 'unknown'

const limitedResponse = (resetAt: number) => NextResponse.json(
  { error: 'rate_limited', resetAt },
  { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } },
)

export async function POST(req: NextRequest): Promise<Response> {
  try {
    let captchaRequired: boolean
    try {
      captchaRequired = isTurnstileRequired()
    } catch (error) {
      if (error instanceof TurnstileConfigurationError) {
        return NextResponse.json({ error: 'captcha_not_configured' }, { status: 503 })
      }
      throw error
    }
    const ip = clientIp(req)
    const ipLimit = await checkRateLimit(`access-request:ip:${ip}`, ACCESS_REQUEST_LIMIT)
    if (ipLimit.limited) return limitedResponse(ipLimit.resetAt)
    const contentLength = Number(req.headers.get('content-length') ?? 0)
    if (contentLength > MAX_CERT_DATA_LENGTH + 16_384) {
      return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    }

    const body = (await req.json()) as {
      email?: string; password?: string; name?: string; phone?: string
      companyId?: string; companyName?: string; cardNumber?: string; requestType?: string
      certificateName?: string; certificateData?: string; message?: string; language?: string
      turnstileToken?: string
      privacyAcknowledged?: boolean; marketingConsent?: boolean
    }
    const email = body.email?.trim().toLowerCase() ?? ''
    const password = body.password ?? ''
    const isNoCard = body.requestType === 'no-card'
    const cardNumber = isNoCard ? '' : normalizeCardNumber(body.cardNumber ?? '')

    if (body.privacyAcknowledged !== true) {
      return NextResponse.json({ error: 'privacy_acknowledgement_required' }, { status: 400 })
    }
    if (!email || !password || (!isNoCard && (!body.companyId || !body.companyName || !cardNumber))) {
      return NextResponse.json({ error: 'missing_fields' }, { status: 400 })
    }
    if (!isNoCard && !isValidCardNumber(cardNumber)) {
      return NextResponse.json({ error: 'invalid_card' }, { status: 400 })
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'invalid_email' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'weak_password' }, { status: 400 })
    }
    if (password.length > 128) {
      return NextResponse.json({ error: 'password_too_long' }, { status: 400 })
    }
    if (
      (body.name?.length ?? 0) > 120
      || (body.phone?.length ?? 0) > 32
      || (body.companyId?.length ?? 0) > 128
      || (body.companyName?.length ?? 0) > 200
      || (body.cardNumber?.length ?? 0) > 64
      || (body.certificateName?.length ?? 0) > 255
      || (body.message?.length ?? 0) > 2000
    ) {
      return NextResponse.json({ error: 'field_too_long' }, { status: 400 })
    }
    if (body.requestType && !['card', 'no-card'].includes(body.requestType)) {
      return NextResponse.json({ error: 'invalid_request_type' }, { status: 400 })
    }
    if (body.language && !['ru', 'en', 'lv'].includes(body.language)) {
      return NextResponse.json({ error: 'invalid_language' }, { status: 400 })
    }

    const emailLimit = await checkRateLimit(`access-request:email:${email}`, ACCESS_REQUEST_LIMIT)
    if (emailLimit.limited) return limitedResponse(emailLimit.resetAt)

    if (captchaRequired) {
      if (!body.turnstileToken?.trim()) {
        return NextResponse.json({ error: 'captcha_required' }, { status: 400 })
      }
      if (!(await verifyTurnstile(body.turnstileToken, ip))) {
        return NextResponse.json({ error: 'captcha_failed' }, { status: 400 })
      }
    }

    const certificateData = body.certificateData
    if (certificateData !== undefined) {
      if (typeof certificateData !== 'string' || certificateData.length > MAX_CERT_DATA_LENGTH) {
        return NextResponse.json({ error: 'certificate_too_large' }, { status: 413 })
      }
      if (!parseDataUrl(certificateData)) {
        return NextResponse.json({ error: 'invalid_certificate' }, { status: 400 })
      }
    }

    // This early lookup avoids an unnecessary bcrypt for the common duplicate case.
    // The partial unique DB index remains the authoritative race-safe constraint.
    const existing = await prisma.accessRequest.findFirst({ where: { email, status: 'pending' } })
    if (existing) return NextResponse.json({ error: 'pending_exists' }, { status: 409 })

    const passwordHash = await hashPassword(password)
    const requestId = randomUUID()
    try {
      await prisma.$transaction(async (tx) => {
        await tx.accessRequest.create({
          data: {
            id: requestId, email, passwordHash,
            name: body.name ?? null, phone: body.phone ?? null,
            companyId: body.companyId ?? '', companyName: body.companyName ?? '',
            cardNumber, requestType: body.requestType ?? 'card',
            certificateName: body.certificateName ?? null, message: body.message ?? null,
            language: body.language ?? null, status: 'pending',
            privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
            privacyAcknowledgedAt: new Date(),
            marketingConsent: body.marketingConsent === true,
            marketingConsentAt: body.marketingConsent === true ? new Date() : null,
          },
        })
        if (certificateData) {
          await saveCertificate(tx, requestId, {
            data: certificateData,
            name: body.certificateName ?? 'certificate',
          })
        }
      })
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        return NextResponse.json({ error: 'pending_exists' }, { status: 409 })
      }
      throw error
    }

    await notifyAdminOfAccessRequest({
      requestType: isNoCard ? 'no-card' : 'card',
      email,
      name: body.name,
      phone: body.phone,
      companyName: body.companyName,
      companyId: body.companyId,
      cardNumber,
      language: body.language,
      message: body.message,
      hasCertificate: Boolean(certificateData),
    })

    if (Math.random() < 0.01) {
      void gcRateLimitStore()
      void cleanupExpiredCertificates(prisma).catch((error) =>
        logApiError("[access-requests] certificate retention cleanup failed", error)
      )
    }
    return NextResponse.json({ id: requestId }, { status: 201 })
  } catch (error) {
    logApiError("[access-requests POST]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}


