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
    if (Math.random() < 0.05) gcRateLimitStore()

    const ip = getClientIp(req)
    const rl = checkRateLimit(`login:${ip}`)
    if (rl.limited) {
      return NextResponse.json(
        { error: 'too_many_attempts', resetAt: rl.resetAt },
        {
          status: 429,
          headers: { 'Retry-After': String(Math.ceil((rl.resetAt - Date.now()) / 1000)) },
        }
      )
    }

    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'email_password_required' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } })
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    // Successful login — reset attempt counter
    resetRateLimit(`login:${ip}`)

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
