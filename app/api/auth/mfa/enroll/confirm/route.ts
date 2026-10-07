import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { hashToken, createSession, mapDbToServerUser } from '@/lib/server-auth'
import { decryptSecret, generateBackupCodes, hashBackupCodes, verifyTotpCode } from '@/lib/mfa'
import {
  consumeMfaChallenge,
  findActiveMfaChallenge,
  mfaAttemptLimited,
  mfaUserAttemptLimited,
  resetMfaAttempts,
  setSessionCookie,
} from '@/lib/mfa-challenge'
import { getClientIp } from '@/lib/request-ip'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

// POST /api/auth/mfa/enroll/confirm — finishes mandatory enrollment: the first valid code
// proves the pending secret reached the authenticator app. Only then is MFA enabled,
// recovery codes issued (shown once) and an MFA-verified session created.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}))
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  if (!challengeToken) return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })

  const tokenHash = hashToken(challengeToken)
  const ip = getClientIp(req)
  if (await mfaAttemptLimited(tokenHash, ip)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  const challenge = await findActiveMfaChallenge(challengeToken)
  if (!challenge || challenge.user.mfaEnabled || !challenge.user.mfaSecret) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }
  const { user } = challenge
  if (await mfaUserAttemptLimited(user.id)) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  let valid: boolean
  try {
    valid = await verifyTotpCode(decryptSecret(user.mfaSecret!), code)
  } catch (error) {
    logApiError('[auth/mfa/enroll/confirm] MFA decryption unavailable', error)
    return NextResponse.json({ error: 'mfa_not_configured' }, { status: 503 })
  }
  if (!valid) return NextResponse.json({ error: 'invalid_code' }, { status: 401 })

  // Single winner on a double submit, so the recovery codes stored are the ones shown.
  if (!(await consumeMfaChallenge(tokenHash))) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }
  const backupCodes = generateBackupCodes()
  // Conditional on the exact pending secret that was verified: a concurrent restart of
  // enrollment (new secret) cannot get a different secret enabled.
  const { count } = await prisma.user.updateMany({
    where: { id: user.id, mfaEnabled: false, mfaSecret: user.mfaSecret },
    data: {
      mfaEnabled: true,
      mfaBackupCodes: await hashBackupCodes(backupCodes),
      mfaEnrolledAt: new Date(),
    },
  })
  if (count !== 1) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }
  await resetMfaAttempts(tokenHash, ip, user.id)

  const token = await createSession(user.id, { mfaVerified: true })
  const res = NextResponse.json({
    user: mapDbToServerUser({ ...user, mfaEnabled: true }),
    backupCodes,
  })
  setSessionCookie(res, token, user)
  return res
}
