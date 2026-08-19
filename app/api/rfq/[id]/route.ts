import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { hasAdminPermission } from '@/lib/admin-permissions'
import { appendServerAudit } from '@/lib/server-audit'
import type { Prisma } from '@/generated/prisma/client'

export const runtime = 'nodejs'

const patchSchema = z.union([
  z.object({ action: z.literal('quote'), quote: z.object({
    totalPrice: z.number().finite().positive().max(100_000_000),
    terms: z.string().trim().min(1).max(5_000),
    validUntil: z.coerce.date(),
  }).strict() }).strict(),
  z.object({ action: z.literal('respond'), decision: z.enum(['accepted', 'rejected']) }).strict(),
  z.object({ action: z.literal('add_internal_note'), note: z.string().trim().min(1).max(2_000) }).strict(),
])

type TimelineEvent = {
  at: string
  type: 'created' | 'quote_sent' | 'accepted' | 'rejected' | 'note'
  note?: string
  internal?: boolean
  quotePrice?: number
  quoteTerms?: string
  quoteValidUntil?: string
}

function timelineOf(value: unknown): TimelineEvent[] {
  return Array.isArray(value) ? value.filter((event): event is TimelineEvent => (
    Boolean(event) && typeof event === 'object' && typeof (event as TimelineEvent).type === 'string'
  )) : []
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const { id } = await params
    const rfq = await prisma.rFQRequest.findUnique({ where: { id } })
    if (!rfq) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const isStaff = hasAdminPermission(user, 'rfq.read')
    if (!isStaff && rfq.companyId !== user.companyId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    const timeline = isStaff ? timelineOf(rfq.timeline) : timelineOf(rfq.timeline).filter((event) => !event.internal)
    return NextResponse.json({ request: { ...rfq, timeline, createdAt: rfq.createdAt.toISOString(), updatedAt: rfq.updatedAt.toISOString() } })
  } catch (error) {
    logApiError('[rfq/:id GET]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const user = await getServerUser()
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    const parsed = patchSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) return NextResponse.json({ error: 'invalid_rfq_action' }, { status: 400 })

    const { id } = await params
    const rfq = await prisma.rFQRequest.findUnique({ where: { id } })
    if (!rfq) return NextResponse.json({ error: 'not_found' }, { status: 404 })
    const isStaff = hasAdminPermission(user, 'rfq.quote')
    if (!isStaff && rfq.companyId !== user.companyId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

    const action = parsed.data
    const now = new Date()
    const timeline = timelineOf(rfq.timeline)
    const data: Record<string, unknown> = {}
    let auditAction = 'rfq.admin_updated'

    if (action.action === 'quote') {
      if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      if (!['pending', 'quoted'].includes(rfq.status)) return NextResponse.json({ error: 'rfq_closed' }, { status: 409 })
      if (action.quote.validUntil.getTime() <= now.getTime()) return NextResponse.json({ error: 'quote_expiry_must_be_future' }, { status: 400 })
      const quote = { ...action.quote, validUntil: action.quote.validUntil.toISOString(), createdAt: now.toISOString() }
      data.status = 'quoted'
      data.quote = quote
      data.timeline = [...timeline, { at: now.toISOString(), type: 'quote_sent', quotePrice: quote.totalPrice, quoteTerms: quote.terms, quoteValidUntil: quote.validUntil }] satisfies TimelineEvent[]
      auditAction = 'rfq.quote_sent'
    } else if (action.action === 'respond') {
      if (isStaff) return NextResponse.json({ error: 'customer_decision_required' }, { status: 403 })
      if (rfq.status !== 'quoted') return NextResponse.json({ error: 'rfq_not_quoted' }, { status: 409 })
      const quote = rfq.quote as { validUntil?: string } | null
      const validUntil = quote?.validUntil ? new Date(quote.validUntil) : null
      if (!validUntil || Number.isNaN(validUntil.getTime()) || validUntil.getTime() < now.getTime()) return NextResponse.json({ error: 'quote_expired' }, { status: 409 })
      data.status = action.decision
      data.timeline = [...timeline, { at: now.toISOString(), type: action.decision }] satisfies TimelineEvent[]
      auditAction = `rfq.${action.decision}`
    } else {
      if (!isStaff) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
      data.timeline = [...timeline, { at: now.toISOString(), type: 'note', note: action.note, internal: true }] satisfies TimelineEvent[]
      auditAction = 'rfq.internal_note_added'
    }

    const updated = await prisma.$transaction(async (tx) => {
      const after = await tx.rFQRequest.update({ where: { id }, data: data as Prisma.RFQRequestUpdateInput })
      await appendServerAudit(tx, req, user, { action: auditAction, entityType: 'rfq', entityId: id, entityTitle: rfq.companyId, before: rfq, after })
      return after
    })
    try {
      const recipientIds = action.action === 'respond'
        ? (await prisma.user.findMany({ where: { OR: [{ platformRole: 'admin' }, { teamRole: 'manager' }] }, select: { id: true } })).map((row) => row.id)
        : action.action === 'quote'
          ? [
              ...(await prisma.companyMember.findMany({ where: { companyId: rfq.companyId }, select: { userId: true } })).map((row) => row.userId),
              ...(await prisma.user.findMany({ where: { companyId: rfq.companyId }, select: { id: true } })).map((row) => row.id),
            ]
          : []
      if (recipientIds.length) {
        const title = action.action === 'quote'
          ? 'Получено коммерческое предложение'
          : action.action === 'respond'
            ? `Клиент ${action.decision === 'accepted' ? 'принял' : 'отклонил'} предложение`
            : 'RFQ обновлён'
        const message = action.action === 'quote' ? `Для заявки ${id} подготовлено предложение.` : `RFQ ${id}: решение клиента сохранено.`
        await prisma.userNotification.createMany({
          data: [...new Set(recipientIds)].map((userId) => ({ userId, type: 'rfq', title, message, link: action.action === 'quote' ? '/request-quote' : '/admin/rfq' })),
        })
      }
    } catch (notificationError) {
      logApiError('[rfq/:id PATCH] notification failed', notificationError)
    }
    return NextResponse.json({ request: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString() } })
  } catch (error) {
    logApiError('[rfq/:id PATCH]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
