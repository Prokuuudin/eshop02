import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/server-auth'
import { getCompanyActivity } from '@/lib/company-activity-log'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!user.companyId) return NextResponse.json({ error: 'company_required' }, { status: 400 })

    const take = Number(req.nextUrl.searchParams.get('take') ?? '100')
    const entries = await getCompanyActivity(user.companyId, Number.isFinite(take) ? take : 100)

    return NextResponse.json({ entries })
  } catch (e) {
    logApiError('[account/audit-log GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
