import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { Prisma } from '@/generated/prisma/client'
import { hashPassword } from '@/lib/server-auth'

export const runtime = 'nodejs'

const MIN_PASSWORD_LENGTH = 6

type ResetRecord = { token: string; email: string; expiresAt: string }
type ResetData = { resets: ResetRecord[] }

const KV_KEY = 'password-resets'

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

// GET ?token=xxx — проверить токен (не удаляет)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  }

  const data = await read()
  const record = data.resets.find((r) => r.token === token)
  if (!record) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })
  }
  if (new Date(record.expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 })
  }

  return NextResponse.json({ ok: true, email: record.email })
}

// POST { token, password } — использовать токен и задать новый пароль в БД (одноразово).
// Пароль пишется server-side (bcrypt): раньше страница сброса меняла только localStorage,
// и настоящий passwordHash в БД не обновлялся — сброс фактически не работал.
export async function POST(request: NextRequest): Promise<NextResponse> {
  let token: string
  let password: string
  try {
    const body = (await request.json()) as { token?: string; password?: string }
    token = (body.token ?? '').trim()
    password = typeof body.password === 'string' ? body.password : ''
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ ok: false, error: 'password_too_short' }, { status: 400 })
  }

  const data = await read()
  const idx = data.resets.findIndex((r) => r.token === token)
  if (idx === -1) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })
  }
  if (new Date(data.resets[idx].expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 })
  }

  const { email } = data.resets[idx]

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
  if (user) {
    const passwordHash = await hashPassword(password)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    })
  }

  // Consume the token only after the password is set.
  data.resets.splice(idx, 1)
  await write(data)

  return NextResponse.json({ ok: true, email })
}
