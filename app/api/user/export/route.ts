import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { exportUserData } from '@/lib/user-erasure'

export const runtime = 'nodejs'

// GDPR Art. 15/20 — the data subject downloads everything held about them as JSON.
export async function GET() {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const data = await exportUserData({
      id: user.id,
      email: user.email,
      name: user.name ?? null,
      companyId: user.companyId ?? null,
    })

    return new NextResponse(JSON.stringify(data, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="my-data-${user.id}.json"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    console.error('[user/export GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
