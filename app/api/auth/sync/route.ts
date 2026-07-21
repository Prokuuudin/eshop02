import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPassword, createSession, SESSION_COOKIE } from '@/lib/server-auth'
import { checkRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  try {
    if (Math.random() < 0.05) void gcRateLimitStore()

    const ip = getClientIp(req)
    const rl = await checkRateLimit(`sync:${ip}`)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'too_many_attempts', resetAt: rl.resetAt },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      )
    }

    const body = await req.json()
    const { email, password } = body

    if (!email || !password) {
      return NextResponse.json({ error: 'id_email_password_required' }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } })

    // Account must already exist — created only via /api/auth/register-card (real card)
    // or an admin invite. This route logs in; it must never double as self-registration.
    if (!existing) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, existing.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    // Password verified — update only safe personal fields
    await prisma.user.update({
      where: { id: existing.id },
      data: {
        name: body.name ?? undefined,
        phone: body.phone ?? undefined,
        cardNumber: body.cardNumber?.trim() ?? undefined,
        avatarUrl: body.avatarUrl ?? undefined,
      },
    })

    const token = await createSession(existing.id)

    const res = NextResponse.json({ ok: true })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (e) {
    console.error('[auth/sync]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

