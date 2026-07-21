import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sendEmail } from '@/lib/mailer'
import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { getTemplates } from '@/lib/email-templates-server-store'
import { hashPassword, hashToken } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

export const runtime = 'nodejs'

// tokenHash/passwordHash only — the raw token lives solely in the emailed link and the
// raw password never touches storage, so a KeyValueSetting/backup leak exposes neither.
export type PendingRegistration = {
  tokenHash: string
  email: string
  name?: string
  cardNumber: string
  phone?: string
  passwordHash: string
  companyId: string
  companyName: string
  expiresAt: string
  language?: string
}

type PendingData = { registrations: PendingRegistration[] }
type Tx = ExtendedTransactionClient

const KV_KEY = 'pending-registrations'

async function readPending(tx: Tx): Promise<PendingData> {
  const row = await tx.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return { registrations: [] }
  return (row.value as PendingData) ?? { registrations: [] }
}

async function writePending(tx: Tx, data: PendingData): Promise<void> {
  await tx.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * KeyValueSetting holds every pending registration in one JSON row, so two concurrent
 * signups doing read-modify-write can clobber each other. Serializable isolation makes
 * Postgres reject the loser with P2034; retry it a few times rather than dropping a
 * registration silently.
 */
async function withPendingTransaction<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await prisma.$transaction(fn, { isolationLevel: 'Serializable' })
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2034' && attempt < 4) continue
      throw e
    }
  }
}

function interpolate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (html, [key, value]) => html.replaceAll(`{{${key}}}`, value),
    template
  )
}

type Lang = 'ru' | 'en' | 'lv'

const CONTENT: Record<Lang, { subject: string; title: string; greeting: string; instruction: string; buttonText: string; expiry: string; ignore: string }> = {
  ru: {
    subject: 'Подтвердите регистрацию',
    title: 'Подтверждение регистрации',
    greeting: 'Здравствуйте',
    instruction: 'Для завершения регистрации перейдите по ссылке:',
    buttonText: 'Подтвердить e-mail',
    expiry: 'Ссылка действительна в течение 24 часов.',
    ignore: 'Если вы не регистрировались — проигнорируйте это письмо.',
  },
  en: {
    subject: 'Confirm your registration',
    title: 'Email confirmation',
    greeting: 'Hello',
    instruction: 'To complete your registration, please follow the link:',
    buttonText: 'Confirm email',
    expiry: 'The link is valid for 24 hours.',
    ignore: 'If you did not register, please ignore this email.',
  },
  lv: {
    subject: 'Apstipriniet reģistrāciju',
    title: 'E-pasta apstiprināšana',
    greeting: 'Labdien',
    instruction: 'Lai pabeigtu reģistrāciju, lūdzu sekojiet saitei:',
    buttonText: 'Apstiprināt e-pastu',
    expiry: 'Saite ir derīga 24 stundas.',
    ignore: 'Ja jūs nereģistrējāties, ignorējiet šo e-pastu.',
  },
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (Math.random() < 0.05) void gcRateLimitStore()

  const ip = getClientIp(request)
  const rl = await checkRateLimit(`register:${ip}`)
  if (rl.limited) {
    return NextResponse.json(
      { ok: false, error: 'too_many_attempts', resetAt: rl.resetAt },
      { status: 429, headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    )
  }

  let body: Partial<PendingRegistration> & { password?: string; language?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const { email, name, cardNumber, phone, password, companyId, companyName } = body
  if (!email || !cardNumber || !password || !companyId || !companyName) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ ok: false, error: 'weak_password' }, { status: 400 })
  }

  const normalizedEmail = email.toLowerCase()

  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
  if (!company) {
    return NextResponse.json({ ok: false, error: 'company_not_found' }, { status: 404 })
  }
  const existingUser = await prisma.user.findUnique({ where: { email: normalizedEmail }, select: { id: true } })
  if (existingUser) {
    return NextResponse.json({ ok: false, error: 'email_taken' }, { status: 409 })
  }

  const language: Lang = (['ru', 'en', 'lv'].includes(body.language ?? '') ? body.language : 'ru') as Lang

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const passwordHash = await hashPassword(password)
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  await withPendingTransaction(async (tx) => {
    const data = await readPending(tx)
    // Удаляем старые заявки с тем же email
    data.registrations = data.registrations.filter(
      (r) => r.email.toLowerCase() !== normalizedEmail
    )
    data.registrations.push({
      tokenHash,
      email: normalizedEmail,
      name,
      cardNumber,
      phone,
      passwordHash,
      companyId,
      companyName,
      expiresAt,
      language,
    })
    await writePending(tx, data)
  })

  const host = request.headers.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`
  const confirmUrl = `${baseUrl}/auth/confirm?token=${token}`

  // Try DB template: registration-{lang} then registration
  const templates = await getTemplates()
  const tpl =
    templates.find((t) => t.id === `registration-${language}`) ??
    templates.find((t) => t.id === 'registration')

  const c = CONTENT[language]
  const firstName = name ?? ''

  let subject: string
  let html: string

  if (tpl) {
    subject = interpolate(tpl.subject, { email: email.toLowerCase() })
    html = interpolate(tpl.body, {
      first_name: firstName,
      email: email.toLowerCase(),
      reset_link: confirmUrl,
    })
  } else {
    subject = c.subject
    html = `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#4f46e5">${c.title}</h2>
      <p>${c.greeting}${firstName ? `, ${firstName}` : ''}!</p>
      <p>${c.instruction}</p>
      <p>
        <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          ${c.buttonText}
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">${c.expiry}<br>${c.ignore}</p>
    </div>`
  }

  await sendEmail(email, subject, html)

  return NextResponse.json({ ok: true })
}
