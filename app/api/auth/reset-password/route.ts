import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

export const runtime = 'nodejs'

const MIN_PASSWORD_LENGTH = 8
const MAX_PASSWORD_LENGTH = 128
const tokenHash = (token: string): string => crypto.createHash('sha256').update(token).digest('hex')

function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown'
}

// GET ?token=xxx — проверить токен (не удаляет)
export async function GET(request: NextRequest): Promise<NextResponse> {
  const token = request.nextUrl.searchParams.get('token')
  if (!token) {
    return NextResponse.json({ ok: false, error: 'missing_token' }, { status: 400 })
  }

  const ipLimit = await checkRateLimit(`reset-password:ip:${getClientIp(request)}`)
  if (ipLimit.limited) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', resetAt: ipLimit.resetAt },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((ipLimit.resetAt - Date.now()) / 1000))) } }
    )
  }

  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: { select: { email: true } } },
  })
  if (!record) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })
  }
  if (new Date(record.expiresAt) < new Date()) {
    return NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 })
  }

  return NextResponse.json({ ok: true, email: record.user.email })
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

  const ipLimit = await checkRateLimit(`reset-password:ip:${getClientIp(request)}`)
  if (ipLimit.limited) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited', resetAt: ipLimit.resetAt },
      { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((ipLimit.resetAt - Date.now()) / 1000))) } }
    )
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ ok: false, error: 'password_too_short' }, { status: 400 })
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return NextResponse.json({ ok: false, error: 'password_too_long' }, { status: 400 })
  }

  const hash = tokenHash(token)
  const record = await prisma.passwordResetToken.findUnique({
    where: { tokenHash: hash },
    include: { user: { select: { id: true, email: true } } },
  })
  if (!record) {
    return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })
  }
  if (record.expiresAt < new Date()) {
    return NextResponse.json({ ok: false, error: 'token_expired' }, { status: 410 })
  }

  const passwordHash = await hashPassword(password)
  const consumed = await prisma.$transaction(async (tx) => {
    const deleted = await tx.passwordResetToken.deleteMany({
      where: { tokenHash: hash, expiresAt: { gt: new Date() } },
    })
    if (deleted.count !== 1) return false
    await tx.user.update({
      where: { id: record.user.id },
      data: { passwordHash, mustChangePassword: false },
    })
    await tx.session.deleteMany({ where: { userId: record.user.id } })
    await tx.passwordResetToken.deleteMany({ where: { userId: record.user.id } })
    return true
  })
  if (!consumed) return NextResponse.json({ ok: false, error: 'invalid_token' }, { status: 404 })

  return NextResponse.json({ ok: true, email: record.user.email })
}
