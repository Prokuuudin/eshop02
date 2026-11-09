import { NextRequest, NextResponse } from 'next/server'
import { hasAdminPermission } from '@/lib/admin-permissions'
import { getServerUser } from '@/lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RuntimeStats = { snapshot: (options?: { minutes?: number; top?: number }) => unknown }

const NO_STORE = { 'Cache-Control': 'private, no-store' }

/**
 * Request and process statistics collected in memory by server.js (server-runtime-stats.js)
 * for the last hour. Platform admins only. Diagnostic: masked client networks, no persistence.
 */
export async function GET(req: NextRequest): Promise<Response> {
  const user = await getServerUser()
  if (!user || !hasAdminPermission(user, 'settings.manage')) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE })
  }

  const stats = (globalThis as { __eshopRuntimeStats?: RuntimeStats }).__eshopRuntimeStats
  if (!stats) {
    return NextResponse.json({
      available: false,
      reason: 'Statistics are collected only by server.js (self-hosted Plesk server).',
    }, { headers: NO_STORE })
  }

  const minutes = Number(req.nextUrl.searchParams.get('minutes') ?? 60)
  const top = Number(req.nextUrl.searchParams.get('top') ?? 15)
  return NextResponse.json(stats.snapshot({ minutes, top }), { headers: NO_STORE })
}
