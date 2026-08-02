import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashToken, createSession, mapDbToServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, consumeBackupCode } from '@/lib/mfa'
import { checkRateLimit } from '@/lib/rate-limit'

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

  const limits = await Promise.all([
    checkRateLimit(`mfa:token:${challengeToken}`, { windowMs: 15 * 60 * 1000, maxAttempts: 5 }),
    checkRateLimit(`mfa:ip:${getClientIp(req)}`, { windowMs: 15 * 60 * 1000, maxAttempts: 5 }),
  ])
  if (limits.some((l) => l.limited)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  const challenge = await prisma.mfaChallenge.findUnique({
    where: { tokenHash: hashToken(challengeToken) },
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

  const totpOk = await verifyTotpCode(decryptSecret(user.mfaSecret), code)
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
  await prisma.mfaChallenge.delete({ where: { tokenHash: challenge.tokenHash } })

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
}
