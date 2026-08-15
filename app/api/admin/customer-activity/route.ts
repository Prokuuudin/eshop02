import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { getCompanyActivityForAdmin } from '@/lib/company-activity-log'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  const user = await requireAdminPermission('customers.read')
  if (user instanceof NextResponse) return user
  try {
    const userId = req.nextUrl.searchParams.get('userId') || undefined
    const takeParam = Number(req.nextUrl.searchParams.get('take') ?? '500')
    const entries = await getCompanyActivityForAdmin({ userId, take: Number.isFinite(takeParam) ? takeParam : 500 })
    return NextResponse.json({ entries })
  } catch (error) {
    logApiError('[admin/customer-activity GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
