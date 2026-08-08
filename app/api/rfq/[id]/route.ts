import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { hasAdminPermission } from '@/lib/admin-permissions'
import { appendServerAudit } from '@/lib/server-audit'

export const runtime = 'nodejs'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const rfq = await prisma.rFQRequest.findUnique({ where: { id } })
    if (!rfq) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (!hasAdminPermission(user, 'rfq.read') && rfq.companyId !== user.companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    return NextResponse.json({
      request: { ...rfq, createdAt: rfq.createdAt.toISOString(), updatedAt: rfq.updatedAt.toISOString() },
    })
  } catch (e) {
    logApiError("[rfq/:id GET]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const { id } = await params
    const rfq = await prisma.rFQRequest.findUnique({ where: { id } })
    if (!rfq) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    if (!hasAdminPermission(user, 'rfq.read') && rfq.companyId !== user.companyId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const data: Record<string, unknown> = {}

    if (hasAdminPermission(user, 'rfq.quote')) {
      // Admin can update status, quote, timeline, notes
      if ('status' in body) data.status = body.status
      if ('quote' in body) data.quote = body.quote ?? null
      if ('timeline' in body) data.timeline = body.timeline
      if ('notes' in body) data.notes = body.notes
    } else {
      // Users can only append notes
      if ('notes' in body) data.notes = body.notes
      if ('timeline' in body) {
        // Only allow appending נdon't let client overwrite existing timeline
        const existing = (rfq.timeline as { at: string; type: string }[]) ?? []
        const incoming = Array.isArray(body.timeline) ? body.timeline : []
        const newEvents = incoming.filter(
          (e: { at: string; type: string }) => e.type === 'note'
        )
        data.timeline = [...existing, ...newEvents]
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'no_allowed_fields' }, { status: 400 })
    }

    const updated = await prisma.$transaction(async (tx) => {
      const after = await tx.rFQRequest.update({ where: { id }, data })
      await appendServerAudit(tx, req, user, {
        action: hasAdminPermission(user, 'rfq.quote') ? 'rfq.admin_updated' : 'rfq.note_added',
        entityType: 'rfq', entityId: id, entityTitle: rfq.companyId, before: rfq, after,
        reason: typeof body.reason === 'string' ? body.reason.slice(0, 1000) : null,
      })
      return after
    })
    return NextResponse.json({
      request: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() },
    })
  } catch (e) {
    logApiError("[rfq/:id PATCH]", e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}





