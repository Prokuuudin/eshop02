import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashToken, createSession, mapDbToServerUser } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, consumeBackupCode } from '@/lib/mfa'
import {
  consumeMfaChallenge,
  findActiveMfaChallenge,
  mfaAttemptLimited,
  mfaUserAttemptLimited,
  resetMfaAttempts,
  setSessionCookie,
} from '@/lib/mfa-challenge'
import { getClientIp } from '@/lib/request-ip'

export const runtime = 'nodejs'

// POST /api/auth/mfa/verify — second step of admin login, after /api/auth/login returned
// { mfaRequired: true, challengeToken }. Deliberately does not call guardOrigin: like
// /api/auth/login, there's no session cookie yet at this point, so it isn't CSRF-able.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}))
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''

  if (!challengeToken) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }

  const tokenHash = hashToken(challengeToken)
  const ip = getClientIp(req)
  if (await mfaAttemptLimited(tokenHash, ip)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  const challenge = await findActiveMfaChallenge(challengeToken)
  // Enrollment challenges (MFA not yet enabled) are completed via /api/auth/mfa/enroll.
  if (!challenge || !challenge.user.mfaEnabled || !challenge.user.mfaSecret) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }
  const { user } = challenge
  if (await mfaUserAttemptLimited(user.id)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  // A decrypt failure (e.g. MFA_ENCRYPTION_KEY misconfigured/rotated) must not throw before
  // the backup-code fallback is checked — that would lock out MFA-enabled admins with no
  // fallback at all instead of just falling through to backup codes.
  let totpOk = false
  try {
    totpOk = await verifyTotpCode(decryptSecret(user.mfaSecret!), code)
  } catch {
    totpOk = false
  }
  if (!totpOk) {
    const backupResult = await consumeBackupCode(user.mfaBackupCodes, code)
    if (!backupResult.ok) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
    }
    // Compare-and-swap on the exact list we read: two concurrent requests with the
    // same recovery code cannot both succeed.
    const { count } = await prisma.user.updateMany({
      where: { id: user.id, mfaBackupCodes: { equals: user.mfaBackupCodes } },
      data: { mfaBackupCodes: backupResult.remaining },
    })
    if (count !== 1) {
      return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
    }
  }

  if (!(await consumeMfaChallenge(tokenHash))) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }
  // Code confirmed valid — a normal successful login doesn't count against later attempts.
  await resetMfaAttempts(tokenHash, ip, user.id)

  const token = await createSession(user.id, { mfaVerified: true })
  const res = NextResponse.json({ user: mapDbToServerUser(user) })
  setSessionCookie(res, token, user)
  return res
}
