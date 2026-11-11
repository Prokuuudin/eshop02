import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdmin } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { invitationBatchId, lockBatch } from '@/lib/invitation-dispatch'
import { getTemplates } from '@/lib/email-templates-server-store'
import { interpolate } from '@/lib/invitation-emails'
import { getSiteUrl } from '@/lib/site-url'
import { logApiError } from '@/lib/observability'
import { INVITE_BATCH_SIZE, resolveInviteLang } from '@/lib/invitations'

export const runtime = 'nodejs'

export async function POST(req: NextRequest): Promise<Response> {
  const actor = await requireAdmin()
  if (actor instanceof NextResponse) return actor

  try {
    const body = await req.json() as { userIds?: string[]; language?: string }
    const userIds = Array.isArray(body.userIds) ? body.userIds : []
    if (userIds.length === 0) return NextResponse.json({ error: 'no_user_ids' }, { status: 400 })
    if (userIds.length > INVITE_BATCH_SIZE) {
      return NextResponse.json({ error: 'too_many', max: INVITE_BATCH_SIZE }, { status: 400 })
    }
    const batchId = invitationBatchId(req, actor.id, 'invitations-sms')
    if (!batchId) return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })

    const language = resolveInviteLang(body.language)
    const template = (await getTemplates()).find((item) => item.id === `sms-invite-${language}`)
    if (!template) return NextResponse.json({ error: 'template_not_found' }, { status: 500 })

    const users = await prisma.user.findMany({
      where: {
        id: { in: userIds },
        cardNumber: { not: null },
        phone: { not: null },
        privacyAcknowledgedAt: null,
        NOT: { phone: '' },
      },
      select: { id: true, name: true, phone: true, cardNumber: true },
    })

    // Development-only transport. Production must never report a fake delivery.
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'sms_provider_not_configured' }, { status: 503 })
    }

    // Delivery rows and their audit event commit together. A technical retry
    // (same Idempotency-Key) finds the committed event and only replays the
    // texts, without recording the batch again.
    const recorded = await prisma.$transaction(async (tx) => {
      await lockBatch(tx, batchId)
      const previous = await tx.auditLog.findFirst({
        where: { requestId: batchId, action: 'invitation.sms_recorded' },
        select: { after: true },
      })
      if (previous) return { replayed: true, userIds: ((previous.after ?? {}) as { userIds?: string[] }).userIds ?? [] }
      if (users.length === 0) return { replayed: false, userIds: [] }
      await tx.invitationDelivery.createMany({
        data: users.map((user) => ({ userId: user.id, channel: 'sms', status: 'sent' })),
      })
      await appendServerAudit(tx, req, actor, {
        action: 'invitation.sms_recorded',
        entityType: 'invitation_batch',
        entityId: batchId,
        requestId: batchId,
        after: { channel: 'sms', simulated: true, batchSize: users.length, userIds: users.map((user) => user.id) },
      })
      return { replayed: false, userIds: users.map((user) => user.id) }
    })

    const registrationUrl = `${getSiteUrl()}/auth/register`
    const included = new Set(recorded.userIds)
    const results = users.filter((user) => included.has(user.id)).map((user) => ({
      userId: user.id,
      phone: user.phone,
      status: 'simulated' as const,
      message: interpolate(template.body, {
        name: user.name ?? '',
        card_number: user.cardNumber ?? '',
        registration_url: registrationUrl,
      }),
    }))
    return NextResponse.json(recorded.replayed ? { simulated: true, results, replayed: true } : { simulated: true, results })
  } catch (error) {
    logApiError('[admin/invitations/sms POST]', error)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
