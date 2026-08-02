import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import {
  verifyPassword,
  createSession,
  mapDbToServerUser,
  hashToken,
  SESSION_COOKIE,
} from '@/lib/server-auth'
import { randomBytes } from 'node:crypto'
import { checkRateLimit, resetRateLimit, gcRateLimitStore } from '@/lib/rate-limit'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    // Occasional GC
    if (Math.random() < 0.05) void gcRateLimitStore()

    const { identifier, email, password } = await req.json()
    const rawIdentifier = identifier ?? email
    if (!rawIdentifier || !password) {
      return NextResponse.json({ error: 'identifier_password_required' }, { status: 400 })
    }
    if (typeof password !== 'string' || password.length > 128) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    const normalizedIdentifier = String(rawIdentifier).trim()
    const isEmail = normalizedIdentifier.includes('@')
    const lookupValue = isEmail
      ? normalizedIdentifier.toLowerCase()
      : normalizedIdentifier.replace(/\s+/g, '').toUpperCase()
    if (!lookupValue || lookupValue.length > (isEmail ? 254 : 64)) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }
    const ip = getClientIp(req)
    const identifierLimitKey = isEmail ? `login:email:${lookupValue}` : `login:card:${lookupValue}`
    const limitKeys = [`login:ip:${ip}`, identifierLimitKey]
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

    const user = isEmail
      ? await prisma.user.findUnique({ where: { email: lookupValue } })
      : await prisma.user.findFirst({
          where: { cardNumber: { equals: lookupValue, mode: 'insensitive' } },
        })
    if (!user || !user.passwordHash) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    const valid = await verifyPassword(password, user.passwordHash)
    if (!valid) {
      return NextResponse.json({ error: 'invalid_credentials' }, { status: 401 })
    }

    // Successful login — reset attempt counter
    await Promise.all(limitKeys.map((key) => resetRateLimit(key)))

    if (user.platformRole === 'admin' && user.mfaEnabled) {
      const challengeToken = randomBytes(32).toString('hex')
      // Clear any prior challenges for this user first — otherwise every login attempt
      // (even ones that never get followed up) leaves a row behind, and a user with
      // several outstanding challenges could sidestep /verify's per-token attempt limit
      // by just logging in again for a fresh token.
      await prisma.mfaChallenge.deleteMany({ where: { userId: user.id } })
      await prisma.mfaChallenge.create({
        data: {
          tokenHash: hashToken(challengeToken),
          userId: user.id,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        },
      })
      return NextResponse.json({ mfaRequired: true, challengeToken })
    }

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
