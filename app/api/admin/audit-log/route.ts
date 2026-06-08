import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import type { AdminLogAction } from '@/lib/admin-log-store'

const ALLOWED_ACTIONS = new Set<AdminLogAction>([
  'order.status_changed', 'order.bulk_status_changed', 'order.note_saved',
  'product.price_changed', 'product.stock_changed', 'product.deleted', 'product.created',
  'promo.created', 'promo.updated', 'promo.deleted', 'promo.toggled',
  'return.status_changed', 'rfq.quote_sent', 'rfq.status_changed',
  'review.status_changed', 'review.deleted',
])

const ALLOWED_ENTITY_TYPES = new Set([
  'order', 'product', 'promo', 'return', 'rfq', 'review',
])

export async function GET(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const { searchParams } = req.nextUrl
    const action = searchParams.get('action') || ''
    const entityType = searchParams.get('entityType') || ''
    const skip = parseInt(searchParams.get('skip') || '0', 10) || 0
    const take = Math.min(200, parseInt(searchParams.get('take') || '100', 10) || 100)

    const where: Record<string, unknown> = {}
    if (action) where.action = action
    if (entityType) where.entityType = entityType

    const [entries, total] = await Promise.all([
      prisma.auditLog.findMany({ where, orderBy: { at: 'desc' }, skip, take }),
      prisma.auditLog.count({ where }),
    ])

    return NextResponse.json({
      entries: entries.map((e) => ({
        ...e,
        at: e.at instanceof Date ? e.at.toISOString() : String(e.at),
      })),
      total,
    })
  } catch (e) {
    console.error('[audit-log GET]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getServerUser()
    if (!user || user.platformRole !== 'admin') {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const body = await req.json()
    const { action, entityType, entityId, entityTitle, before, after, details } = body

    // Validate against allowlists — reject unknown actions/entity types
    if (!action || !ALLOWED_ACTIONS.has(action as AdminLogAction)) {
      return NextResponse.json({ error: 'invalid_action' }, { status: 400 })
    }
    if (!entityType || !ALLOWED_ENTITY_TYPES.has(entityType as string)) {
      return NextResponse.json({ error: 'invalid_entity_type' }, { status: 400 })
    }
    if (!entityId) {
      return NextResponse.json({ error: 'entityId_required' }, { status: 400 })
    }

    // All trusted fields come from the server session — never from the client
    await prisma.auditLog.create({
      data: {
        id: randomUUID(),
        at: new Date(),
        adminEmail: user.email,
        adminName: user.name ?? null,
        action,
        entityType,
        entityId: String(entityId),
        entityTitle: typeof entityTitle === 'string' ? entityTitle : null,
        before: before ?? null,
        after: after ?? null,
        details: typeof details === 'string' ? details : null,
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[audit-log POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
