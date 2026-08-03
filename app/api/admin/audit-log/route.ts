import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'

export async function GET(req: NextRequest): Promise<Response> {
  try {
    const user = await requireAdminPermission('audit.read')
    if (user instanceof NextResponse) return user
    const action = req.nextUrl.searchParams.get('action') || ''
    const entityType = req.nextUrl.searchParams.get('entityType') || ''
    const skip = Math.max(0, Number.parseInt(req.nextUrl.searchParams.get('skip') || '0', 10) || 0)
    const take = Math.min(200, Math.max(1, Number.parseInt(req.nextUrl.searchParams.get('take') || '100', 10) || 100))
    const where = { ...(action ? { action } : {}), ...(entityType ? { entityType } : {}) }
    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
    ])
    return NextResponse.json({ entries: entries.map((entry) => ({ ...entry, sequence: entry.sequence.toString(), at: entry.at.toISOString() })), total })
  } catch (error) {
    console.error('[audit-log GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(): Promise<Response> {
  return NextResponse.json({ error: 'client_audit_writes_disabled' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function DELETE(): Promise<Response> {
  return NextResponse.json({ error: 'audit_retention_policy_only' }, { status: 405, headers: { Allow: 'GET' } })
}
