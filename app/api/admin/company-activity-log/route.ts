import { NextRequest, NextResponse } from 'next/server'
import { requireAdminPermission } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { getCompanyActivityForAdmin } from '@/lib/company-activity-log'
import { appendServerAudit } from '@/lib/server-audit'
import { logApiError } from '@/lib/observability'

export const runtime = 'nodejs'

export async function GET(req: NextRequest): Promise<Response> {
  const user = await requireAdminPermission('audit.read')
  if (user instanceof NextResponse) return user
  try {
    const takeParam = Number(req.nextUrl.searchParams.get('take') ?? '500')
    const entries = await getCompanyActivityForAdmin({ take: Number.isFinite(takeParam) ? takeParam : 500 })
    return NextResponse.json({ entries })
  } catch (error) {
    logApiError('[admin/company-activity-log GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

// Unlike /api/admin/audit-log (tamper-evident hash chain, append-only by design),
// CompanyActivityLog is a plain activity feed — genuine deletion is safe here and
// is what actually backs the "clear entries older than N days" admin action.
export async function DELETE(req: NextRequest): Promise<Response> {
  const actor = await requireAdminPermission('audit.read')
  if (actor instanceof NextResponse) return actor
  try {
    const olderThanDays = Number(req.nextUrl.searchParams.get('olderThanDays') ?? '90')
    if (!Number.isFinite(olderThanDays) || olderThanDays < 1) {
      return NextResponse.json({ error: 'invalid_olderThanDays' }, { status: 400 })
    }
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000)

    const deletedCount = await prisma.$transaction(async (tx) => {
      const result = await tx.companyActivityLog.deleteMany({ where: { createdAt: { lt: cutoff } } })
      await appendServerAudit(tx, req, actor, {
        action: 'company_activity_log.purge',
        entityType: 'companyActivityLog',
        entityId: 'bulk',
        details: `Deleted ${result.count} entries older than ${olderThanDays} days`,
      })
      return result.count
    })

    return NextResponse.json({ deletedCount })
  } catch (error) {
    logApiError('[admin/company-activity-log DELETE]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
