import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { getAdminDashboardPrefs, saveAdminDashboardPrefs, type AdminDashboardPrefs } from '@/lib/admin-dashboard-prefs-server-store'

export const runtime = 'nodejs'

export async function GET(): Promise<Response> {
  const actor = await requireAdminPermission('admin.access')
  if (actor instanceof NextResponse) return actor

  const prefs = await getAdminDashboardPrefs(actor.id)
  return NextResponse.json(prefs)
}

export async function PUT(request: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('admin.access')
  if (actor instanceof NextResponse) return actor

  try {
    const payload = (await request.json()) as Partial<AdminDashboardPrefs>
    const saved = await saveAdminDashboardPrefs(actor.id, payload)
    return NextResponse.json(saved)
  } catch {
    return NextResponse.json({ error: 'failed_to_save_dashboard_prefs' }, { status: 400 })
  }
}
