import { NextRequest, NextResponse } from 'next/server'
import QRCode from 'qrcode'
import { prisma } from '@/lib/prisma'
import { hashToken } from '@/lib/server-auth'
import { buildOtpauthUri, encryptSecret, generateTotpSecret } from '@/lib/mfa'
import { findActiveMfaChallenge, mfaAttemptLimited } from '@/lib/mfa-challenge'
import { getClientIp } from '@/lib/request-ip'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

// POST /api/auth/mfa/enroll — mandatory first-time TOTP setup during login. Called with the
// challenge token that /api/auth/login returned for an admin-capable user without MFA.
// Stores an encrypted pending secret; nothing is enabled and no session exists until
// /api/auth/mfa/enroll/confirm verifies a code from the authenticator app.
// No guardOrigin: like /api/auth/login there is no session cookie, so it isn't CSRF-able.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = await req.json().catch(() => ({}))
  const challengeToken = typeof body.challengeToken === 'string' ? body.challengeToken : ''
  if (!challengeToken) return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })

  if (await mfaAttemptLimited(hashToken(challengeToken), getClientIp(req))) {
    return NextResponse.json({ error: 'too_many_attempts' }, { status: 429 })
  }

  const challenge = await findActiveMfaChallenge(challengeToken)
  // An already-enrolled account can never be re-bound to a new device from here.
  if (!challenge || challenge.user.mfaEnabled) {
    return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })
  }
  const { user } = challenge

  let encrypted: string
  const secret = generateTotpSecret()
  try {
    encrypted = encryptSecret(secret)
  } catch (error) {
    // Missing/invalid MFA_ENCRYPTION_KEY: fail closed, never store the secret in plaintext.
    logApiError('[auth/mfa/enroll] MFA encryption unavailable', error)
    return NextResponse.json({ error: 'mfa_not_configured' }, { status: 503 })
  }

  const { count } = await prisma.user.updateMany({
    where: { id: user.id, mfaEnabled: false },
    data: { mfaSecret: encrypted },
  })
  if (count !== 1) return NextResponse.json({ error: 'invalid_challenge' }, { status: 401 })

  const uri = buildOtpauthUri(user.email, secret)
  // The raw secret is returned once, to its owner, for manual entry when the QR can't be scanned.
  return NextResponse.json({ qrCodeDataUrl: await QRCode.toDataURL(uri), secret })
}
