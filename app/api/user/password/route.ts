import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerUser, hashPassword, verifyPassword, createSession, SESSION_COOKIE } from '@/lib/server-auth'
import { guardOrigin } from '@/lib/api-guard'

export const runtime = 'nodejs'

const MIN_LENGTH = 8
const MAX_LENGTH = 128

// POST /api/user/password — change the signed-in user's password.
// Auth is server-authoritative (bcrypt hash in DB): the old localStorage-only
// flows never actually changed the password. This is the single source of truth.
export async function POST(req: NextRequest): Promise<NextResponse> {
  const blocked = guardOrigin(req)
  if (blocked) return blocked

  try {
    const session = await getServerUser({ allowPasswordChangeRequired: true })
    if (!session) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    if (newPassword.length < MIN_LENGTH) {
      return NextResponse.json({ error: 'password_too_short' }, { status: 400 })
    }
    if (newPassword.length > MAX_LENGTH) {
      return NextResponse.json({ error: 'password_too_long' }, { status: 400 })
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

    // Rotate sessions: a changed password should invalidate every existing session (e.g. one
    // stolen alongside the old password) and reissue a fresh one for the current request.
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
  } catch (e) {
    console.error('[user/password POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
