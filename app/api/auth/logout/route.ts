import { NextRequest, NextResponse } from 'next/server'
import { deleteSession, getServerUser, SESSION_COOKIE } from '@/lib/server-auth'
import { recordCompanyActivity } from '@/lib/company-activity-log'
import { logApiError } from '@/lib/observability'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) {
    const user = await getServerUser().catch(() => null)
    if (user?.companyId && user.auditLoggingEnabled) {
      recordCompanyActivity({
        companyId: user.companyId,
        userId: user.id,
        userName: user.name,
        userEmail: user.email,
        action: 'team_member_logout',
      }).catch((err) => logApiError('[auth/logout] activity log failed', err))
    }
    await deleteSession(token)
  }

  const res = NextResponse.json({ ok: true })
  res.cookies.set(SESSION_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  })
  return res
}
