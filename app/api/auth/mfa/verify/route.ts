import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashToken, createSession, mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, consumeBackupCode } from '@/lib/mfa'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'

export const runtime = 'nodejs'

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

// POST /api/auth/mfa/verify — second step of admin login, after /api/auth/login returned
// { mfaRequired: true, challengeToken }. Deliberately does not call guardOrigin: like
// /api/auth/login, there's no session cookie yet at this point, so it isn't CSRF-able.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}))
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken : ''
  const code = typeof body.code === 'string' ? body.code : ''

  if (!challengeToken) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }

  const tokenHash = hashToken(challengeToken)
  const tokenLimitKey = `mfa:token:${tokenHash}`
  const ipLimitKey = `mfa:ip:${getClientIp(req)}`
  const limits = await Promise.all([
    checkRateLimit(tokenLimitKey, { windowMs: 15 * 60 * 1000, maxAttempts: 5 }),
    checkRateLimit(ipLimitKey, { windowMs: 15 * 60 * 1000, maxAttempts: 5 }),
  ])
  if (limits.some((l) => l.limited)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  const challenge = await prisma.mfaChallenge.findUnique({
    where: { tokenHash },
    include: { user: true },
  })
  if (!challenge || challenge.expiresAt < new Date()) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }

  const { user } = challenge
  // Re-check live state, not just the fact that a challenge exists — role/MFA status
  // may have changed in the (up to 5-minute) gap since /api/auth/login created it.
  if (user.platformRole !== 'admin' || !user.mfaEnabled || !user.mfaSecret) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }

  // A decrypt failure (e.g. MFA_ENCRYPTION_KEY misconfigured/rotated) must not throw before
  // the backup-code fallback is checked — that would lock out MFA-enabled admins with no
  // fallback at all instead of just falling through to backup codes.
  let totpOk = false
  try {
    totpOk = await verifyTotpCode(decryptSecret(user.mfaSecret), code)
  } catch {
    totpOk = false
  }
  let remainingBackupCodes = user.mfaBackupCodes
  let usedBackupCode = false
  if (!totpOk) {
    const backupResult = await consumeBackupCode(user.mfaBackupCodes, code)
    if (!backupResult.ok) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
    }
    remainingBackupCodes = backupResult.remaining
    usedBackupCode = true
  }

  if (usedBackupCode) {
    await prisma.user.update({ where: { id: user.id }, data: { mfaBackupCodes: remainingBackupCodes } })
  }
  // deleteMany (not delete): idempotent if this row was somehow already removed by a
  // concurrent double-submit — no P2025 throw for zero rows matched.
  await prisma.mfaChallenge.deleteMany({ where: { tokenHash: challenge.tokenHash } })
  // Code confirmed valid — clear both rate-limit counters so a normal successful login
  // doesn't count against later attempts (mirrors login/route.ts's post-password reset).
  await Promise.all([resetRateLimit(tokenLimitKey), resetRateLimit(ipLimitKey)])

  const token = await createSession(user.id)
  const res = NextResponse.json({ user: mapDbToServerUser(user) })
  // MFA only exists on admin accounts (see login/route.ts's mfaEnabled gate), so this
  // path is always the 1-day admin session - mirror createSession()'s own expiry
  // instead of the 30-day default, matching the same fix in login/route.ts.
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 1,
  })
  return res
}
