import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { sendEmail } from '@/lib/mailer'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'

export const runtime = 'nodejs'

type ResetRecord = { token: string; email: string; expiresAt: string }
type ResetData = { resets: ResetRecord[] }

const KV_KEY = 'password-resets'
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

async function read(): Promise<ResetData> {
  const row = await prisma.keyValueSetting.findUnique({ where: { key: KV_KEY } })
  if (!row) return { resets: [] }
  return (row.value as ResetData) ?? { resets: [] }
}

async function write(data: ResetData): Promise<void> {
  await prisma.keyValueSetting.upsert({
    where: { key: KV_KEY },
    create: { key: KV_KEY, value: data as unknown as Prisma.InputJsonValue },
    update: { value: data as unknown as Prisma.InputJsonValue },
  })
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let email: string
  try {
    const body = (await request.json()) as { email?: string }
    email = (body.email ?? '').trim().toLowerCase()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (!EMAIL_REGEX.test(email) || email.length > 160) {
    return NextResponse.json({ ok: false, error: 'invalid_email' }, { status: 422 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString()

  const data = await read()
  data.resets = data.resets.filter(
    (r) => r.email !== email && new Date(r.expiresAt) > new Date()
  )
  data.resets.push({ token, email, expiresAt })
  await write(data)

  const host = request.headers.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`
  const resetUrl = `${baseUrl}/auth/reset-password?token=${token}`

  try {
    await sendEmail(
      email,
      'Сброс пароля',
      `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
        <h2 style="color:#4f46e5">Сброс пароля</h2>
        <p>Мы получили запрос на сброс пароля для вашего аккаунта.</p>
        <p>Нажмите кнопку ниже, чтобы задать новый пароль:</p>
        <p style="margin:24px 0">
          <a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
            Сбросить пароль
          </a>
        </p>
        <p style="color:#6b7280;font-size:13px">Ссылка действительна 1 час.<br>Если вы не запрашивали сброс — проигнорируйте это письмо.</p>
      </div>`
    )
  } catch (err) {
    console.error('[forgot-password] sendEmail error:', err)
  }

  // Всегда 200 — не раскрываем наличие email в базе
  return NextResponse.json({ ok: true })
}
