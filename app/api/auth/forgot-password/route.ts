import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sendEmail } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'
import { getTemplates } from '@/lib/email-templates-server-store'
import { getSiteUrl } from '@/lib/site-url'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

export const runtime = 'nodejs'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const tokenHash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex')

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template
  )
}

type Lang = 'ru' | 'en' | 'lv'

const CONTENT: Record<Lang, { subject: string; title: string; intro: string; buttonText: string; expiry: string; ignore: string }> = {
  ru: {
    subject: 'Сброс пароля',
    title: 'Сброс пароля',
    intro: 'Мы получили запрос на сброс пароля для вашего аккаунта.',
    buttonText: 'Сбросить пароль',
    expiry: 'Ссылка действительна 1 час.',
    ignore: 'Если вы не запрашивали сброс — проигнорируйте это письмо.',
  },
  en: {
    subject: 'Password reset',
    title: 'Password reset',
    intro: 'We received a request to reset the password for your account.',
    buttonText: 'Reset password',
    expiry: 'The link is valid for 1 hour.',
    ignore: 'If you did not request a reset, please ignore this email.',
  },
  lv: {
    subject: 'Paroles atjaunošana',
    title: 'Paroles atjaunošana',
    intro: 'Mēs saņēmām pieprasījumu atjaunot jūsu konta paroli.',
    buttonText: 'Atjaunot paroli',
    expiry: 'Saite ir derīga 1 stundu.',
    ignore: 'Ja jūs to neprasījāt, vienkārši ignorējiet šo e-pastu.',
  },
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let email: string
  let language: Lang
  try {
    const body = (await request.json()) as { email?: string; language?: string }
    email = (body.email ?? '').trim().toLowerCase()
    language = (['ru', 'en', 'lv'].includes(body.language ?? '') ? body.language : 'ru') as Lang
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (!EMAIL_REGEX.test(email) || email.length > 160) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 422 })
  }

  if (Math.random() < 0.05) void gcRateLimitStore()
  const ipLimit = await checkRateLimit(`forgot-password:ip:${getClientIp(request)}`)
  const emailLimit = await checkRateLimit(`forgot-password:email:${email}`)
  if (ipLimit.limited || emailLimit.limited) {
    const resetAt = Math.max(ipLimit.resetAt, emailLimit.resetAt)
    return NextResponse.json(
      { ok: false, error: 'rate_limited', resetAt },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((resetAt - Date.now()) / 1000))) } }
    )
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } })
  if (!user) return NextResponse.json({ ok: true })

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000)
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } })
    await tx.passwordResetToken.create({ data: { tokenHash: tokenHash(token), userId: user.id, expiresAt } })
  })

  // Never derive the reset base URL from the client-controlled Host header —
  // a poisoned Host would send the victim a reset link (with token) to an attacker
  // domain. getSiteUrl() resolves from trusted env only (NEXT_PUBLIC_SITE_URL / VERCEL_URL).
  const baseUrl = getSiteUrl()
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`

  // Try DB template: password-reset-{lang} then password-reset
  const templates = await getTemplates()
  const tpl =
    templates.find((t) => t.id === `password-reset-${language}`) ??
    templates.find((t) => t.id === 'password-reset')

  const c = CONTENT[language]

  let subject: string
  let html: string

  if (tpl) {
    subject = interpolate(tpl.subject, { email })
    html = interpolate(tpl.body, { email, reset_link: resetUrl })
  } else {
    subject = c.subject
    html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#4f46e5">${c.title}</h2>
      <p>${c.intro}</p>
      <p style="margin:24px 0">
        <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          ${c.buttonText}
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">${c.expiry}<br>${c.ignore}</p>
    </div>`
  }

  try {
    await sendEmail(email, subject, html)
  } catch (err) {
    console.error('[forgot-password] sendEmail error:', err)
  }

  // Always 200 — don't reveal whether email exists
  return NextResponse.json({ ok: true })
}
