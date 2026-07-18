import { NextRequest, NextResponse } from 'next/server'
import { getServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { anonymizeUser } from '@/lib/user-erasure'

export const runtime = 'nodejs'

// GDPR Art. 17 — right to erasure. Implemented as anonymisation: orders/invoices are
// retained (tax/accounting) with their personal fields blanked, the account is scrubbed
// and permanently locked, and the session is cleared.
export async function DELETE(req: NextRequest) {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value
    const user = await getServerUser()
    if (!user || !token) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }

    // Admins can't self-erase — it would orphan the platform's only admin and the
    // audit trail. They must be handled out-of-band.
    if (user.platformRole === 'admin') {
      return NextResponse.json({ error: 'admin_cannot_self_delete' }, { status: 403 })
    }

    await anonymizeUser({ id: user.id, email: user.email })

    const res = NextResponse.json({ ok: true })
    // Clear the session cookie immediately (the DB session rows are already gone).
    res.cookies.set(SESSION_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    })
    return res
  } catch (e) {
    console.error('[user DELETE]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
