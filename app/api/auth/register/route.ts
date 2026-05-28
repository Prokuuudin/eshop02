import { NextRequest, NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import crypto from 'crypto'
import { sendEmail } from '@/lib/mailer'

export const runtime = 'nodejs'

export type PendingRegistration = {
  token: string
  email: string
  name?: string
  cardNumber: string
  phone?: string
  password: string
  companyId: string
  companyName: string
  expiresAt: string
}

type PendingData = { registrations: PendingRegistration[] }

const DATA_PATH = path.join(process.cwd(), 'data', 'pending-registrations.json')

async function readPending(): Promise<PendingData> {
  try {
    const raw = await fs.readFile(DATA_PATH, 'utf-8')
    return JSON.parse(raw) as PendingData
  } catch {
    return { registrations: [] }
  }
}

async function writePending(data: PendingData): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), 'utf-8')
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  let body: Partial<PendingRegistration>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const { email, name, cardNumber, phone, password, companyId, companyName } = body
  if (!email || !cardNumber || !password || !companyId || !companyName) {
    return NextResponse.json({ ok: false, error: 'missing_fields' }, { status: 400 })
  }

  const token = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const data = await readPending()
  // Удаляем старые заявки с тем же email
  data.registrations = data.registrations.filter(
    (r) => r.email.toLowerCase() !== email.toLowerCase()
  )
  data.registrations.push({
    token,
    email: email.toLowerCase(),
    name,
    cardNumber,
    phone,
    password,
    companyId,
    companyName,
    expiresAt,
  })
  await writePending(data)

  const host = request.headers.get('host') ?? 'localhost:3000'
  const proto = host.startsWith('localhost') ? 'http' : 'https'
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? `${proto}://${host}`
  const confirmUrl = `${baseUrl}/auth/confirm?token=${token}`

  await sendEmail(
    email,
    'Подтвердите регистрацию',
    `<div style="font-family:sans-serif;max-width:480px;margin:0 auto">
      <h2 style="color:#4f46e5">Подтверждение регистрации</h2>
      <p>Здравствуйте${name ? `, ${name}` : ''}!</p>
      <p>Для завершения регистрации перейдите по ссылке:</p>
      <p>
        <a href="${confirmUrl}" style="display:inline-block;padding:12px 24px;background:#4f46e5;color:#fff;border-radius:6px;text-decoration:none;font-weight:600">
          Подтвердить e-mail
        </a>
      </p>
      <p style="color:#6b7280;font-size:13px">Ссылка действительна в течение 24 часов.<br>Если вы не регистрировались — проигнорируйте это письмо.</p>
    </div>`
  )

  return NextResponse.json({ ok: true })
}
