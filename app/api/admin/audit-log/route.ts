import { NextRequest, NextResponse } from 'next/server'
import { auditActorLookups, classifyAuditActors } from '@/lib/audit-actor-status'
import { logApiError } from '@/lib/observability'
import { parseOffsetPagination } from '@/lib/pagination'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await requireAdminPermission('audit.read')
    if (user instanceof NextResponse) return user
    const action = req.nextUrl.searchParams.get('action') || ''
    const entityType = req.nextUrl.searchParams.get('entityType') || ''
    const { skip, take } = parseOffsetPagination(req.nextUrl.searchParams)
    const where = { ...(action ? { action } : {}), ...(entityType ? { entityType } : {}) }
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
    ])
    // Current standing of this page's actors, so the admin filter can mark former and deleted ones.
    const { ids, emails } = auditActorLookups(entries)
    const actorUsers = ids.length + emails.length === 0 ? [] : await prisma.user.findMany({
      where: { OR: [{ id: { in: ids } }, { email: { in: emails, mode: 'insensitive' } }] },
      select: { id: true, email: true, platformRole: true, teamRole: true },
    })
    return NextResponse.json({
      entries: entries.map((entry) => ({ ...entry, sequence: entry.sequence.toString(), at: entry.at.toISOString() })),
      total,
      actorStatus: classifyAuditActors(entries, actorUsers),
    })
  } catch (error) {
    logApiError("[audit-log GET]", error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(): Promise<Response> {
  return NextResponse.json({ error: 'client_audit_writes_disabled' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function DELETE(): Promise<Response> {
  return NextResponse.json({ error: 'audit_retention_policy_only' }, { status: 405, headers: { Allow: 'GET' } })
}


