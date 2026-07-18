import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser, hashPassword, verifyPassword } from '@/lib/server-auth'

export const runtime = 'nodejs'

const MIN_LENGTH = 6

// POST /api/user/password — change the signed-in user's password.
// Auth is server-authoritative (bcrypt hash in DB): the old localStorage-only
// flows never actually changed the password. This is the single source of truth.
export async function POST(req: NextRequest) {
  try {
    const session = await getServerUser()
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    if (newPassword.length < MIN_LENGTH) {
      return NextResponse.json({ error: 'password_too_short' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({
      where: { id: session.id },
      select: { id: true, passwordHash: true, mustChangePassword: true },
    })
    if (!user) return NextResponse.json({ error: 'user_not_found' }, { status: 404 })

    // Forced first-login change (mustChangePassword): the user is session-authenticated
    // and has no meaningful "current" password beyond the shared default — skip the check.
    // Everyone else must prove the current password before it can be replaced.
    if (!user.mustChangePassword) {
      const valid = await verifyPassword(currentPassword, user.passwordHash)
      if (!valid) {
        return NextResponse.json({ error: 'invalid_current_password' }, { status: 401 })
      }
    }

    const passwordHash = await hashPassword(newPassword)
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, mustChangePassword: false },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[user/password POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
