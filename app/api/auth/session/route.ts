import { NextResponse } from 'next/server'
import { getStaffSessionStatus } from '@/lib/server-auth'

export const runtime = 'nodejs'

const NO_STORE = { 'Cache-Control': 'no-store' }

// POST /api/auth/session — browser-presence heartbeat for staff sessions
// (lib/admin-session-policy.ts). Sent by components/auth/AdminSessionPresence.tsx
// while any page of the site is open. It grants nothing: it only reports whether
// the staff session is still live and keeps its short presence deadline moving.
// Customer sessions are not tracked and get 401 like a missing session.
// Same-origin only: the proxy's cookie-mutation Origin check applies to POST.
export async function POST(): Promise<NextResponse> {
  const status = await getStaffSessionStatus()
  if (!status) {
    return NextResponse.json({ error: 'session_expired' }, { status: 401, headers: NO_STORE })
  }
  return NextResponse.json(
    { ok: true, absoluteExpiresAt: status.absoluteExpiresAt.toISOString() },
    { headers: NO_STORE },
  )
}
