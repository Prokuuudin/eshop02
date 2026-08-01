import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'

// GET /api/user/mfa/status — used by the admin account "Security" section to render
// enrollment state without exposing the secret or backup-code hashes themselves.
export async function GET(_req: NextRequest): Promise<NextResponse> {
  const user = await getServerUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (user.platformRole !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { mfaEnabled: true, mfaEnrolledAt: true, mfaBackupCodes: true },
  })

  return NextResponse.json({
    enabled: dbUser?.mfaEnabled ?? false,
    enrolledAt: dbUser?.mfaEnrolledAt ? dbUser.mfaEnrolledAt.toISOString() : null,
    backupCodesRemaining: dbUser?.mfaBackupCodes.length ?? 0,
  })
}
