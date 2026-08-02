import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser, verifyPassword, createSession, SESSION_COOKIE } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, consumeBackupCode } from '@/lib/mfa'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

// POST /api/user/mfa/disable — requires both the current password and a valid TOTP/backup
// code (defense in depth, mirrors how password change requires the old password). Rotates
// sessions on success: if an attacker who stole the current session tries to strip MFA
// remotely, the real admin's other sessions die and they'll notice.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  const code = typeof body.code === 'string' ? body.code : ''

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { passwordHash: true, mfaSecret: true, mfaEnabled: true, mfaBackupCodes: true },
  })
  // Also requires mfaEnabled (not just a leftover mfaSecret) so a pending/never-confirmed
  // setup can't be "disabled" through this route — matches /backup-codes/regenerate's check.
  if (!dbUser?.mfaEnabled || !dbUser.mfaSecret) {
    return NextResponse.json({ error: 'mfa_not_enabled' }, { status: 400 })
  }

  const passwordOk = await verifyPassword(currentPassword, dbUser.passwordHash)
  if (!passwordOk) {
    return NextResponse.json({ error: 'invalid_current_password' }, { status: 401 })
  }

  // A decrypt failure (e.g. MFA_ENCRYPTION_KEY misconfigured/rotated) must not throw before
  // the backup-code fallback is checked — that would 500 instead of letting a code-holding
  // admin clear the flag.
  let totpOk = false
  try {
    totpOk = await verifyTotpCode(decryptSecret(dbUser.mfaSecret), code)
  } catch {
    totpOk = false
  }
  const codeOk = totpOk || (await consumeBackupCode(dbUser.mfaBackupCodes, code)).ok
  if (!codeOk) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaEnrolledAt: null },
  })

  await prisma.session.deleteMany({ where: { userId: user.id } })
  const newToken = await createSession(user.id)

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, newToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  })
  return res
}
