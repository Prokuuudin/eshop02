import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  createSession,
  mapDbToServerUser,
  SESSION_COOKIE,
} from '@/lib/server-auth'
import { checkRateLimit, resetRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: NextRequest) {
  try {
    // Occasional GC
    if (Math.random() < 0.05) void gcRateLimitStore()

    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'email_password_required' }, { status: 400 })
    }

    const normalizedEmail = String(email).trim().toLowerCase()
    if (normalizedEmail.length > 254) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    const ip = getClientIp(req)
    const limitKeys = [`login:ip:${ip}`, `login:email:${normalizedEmail}`]
    const limits = await Promise.all(limitKeys.map((key) => checkRateLimit(key)))
    const limited = limits.find((result) => result.limited)
    if (limited) {
      return NextResponse.json(
        { error: 'too_many_attempts', resetAt: limited.resetAt },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.max(1, Math.ceil((limited.resetAt - Date.now()) / 1000))) },
        }
      )
    }

    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    // Successful login — reset attempt counter
    await Promise.all(limitKeys.map((key) => resetRateLimit(key)))

    const token = await createSession(user.id)

    const res = NextResponse.json({ user: mapDbToServerUser(user) })
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return res
  } catch (e) {
    console.error('[auth/login]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
