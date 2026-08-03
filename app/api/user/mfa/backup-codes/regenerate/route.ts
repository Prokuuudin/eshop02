import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode, generateBackupCodes, hashBackupCodes } from '@/lib/mfa'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

// POST /api/user/mfa/backup-codes/regenerate — TOTP code only (not the password): this
// doesn't weaken anything, since the caller already has an authenticated session.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({}))
  const code = typeof body.code === 'string' ? body.code : ''

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaSecret: true, mfaEnabled: true },
  })
  if (!dbUser?.mfaEnabled || !dbUser.mfaSecret) {
    return NextResponse.json({ error: 'mfa_not_enabled' }, { status: 400 })
  }

  const valid = await verifyTotpCode(decryptSecret(dbUser.mfaSecret), code)
  if (!valid) {
    return NextResponse.json({ error: 'invalid_code' }, { status: 401 })
  }

  const backupCodes = generateBackupCodes()
  await prisma.user.update({
    where: { id: user.id },
    data: { mfaBackupCodes: await hashBackupCodes(backupCodes) },
  })

  return NextResponse.json({ backupCodes })
}
