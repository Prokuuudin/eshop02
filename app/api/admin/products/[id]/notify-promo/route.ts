import { NextRequest, NextResponse } from 'next/server'
import { logApiError } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { invitationBatchId } from '@/lib/invitation-dispatch'
import { prepareAuditedDelivery } from '@/lib/audited-delivery'
import {
  planProductNews,
  productNewsNotifications,
  promoNews,
  sendProductNewsEmails,
} from '@/lib/product-news-notify'

export const runtime = 'nodejs'

const PROMO_EVENTS = { prepared: 'product.promo_notification_prepared', recorded: 'product.promo_notification_recorded' }
type PromoResult = { channel: 'email+app'; sent: number; failed: number; skippedInvalidEmail: number; appNotifications: number }

class PromoResultAuditError extends Error {}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const actor = await requireAdminPermission('catalog.update')
  if (actor instanceof NextResponse) return actor
  try {
    const { id } = await params
    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, title: true, isDeleted: true },
    })
    if (!product || product.isDeleted) return NextResponse.json({ error: 'product_not_found' }, { status: 404 })

    const body = (await req.json().catch(() => ({}))) as { message?: string }
    const message = typeof body.message === 'string' ? body.message.slice(0, 500) : undefined
    const batchId = invitationBatchId(req, actor.id, 'notify-promo')
    if (!batchId) return NextResponse.json({ error: 'invalid_idempotency_key' }, { status: 400 })

    const news = promoNews(id, product.title, message)
    const plan = await planProductNews(id, 'notifyPromo', prisma)
    // No subscribers: nothing is sent or written, as before — and nothing to audit.
    if (plan.subscribers.length === 0) return NextResponse.json({ ok: true })

    // 1. Audited claim before SMTP (internal IDs and counts only — no addresses
    //    or message text). A technical retry with the same key replays or, while
    //    the outcome is unknown, refuses; it never mails subscribers twice.
    const target = { entityType: 'product', entityId: id }
    const claim = await prepareAuditedDelivery({
      request: req, actor, batchId, actions: PROMO_EVENTS, target,
      after: {
        channel: 'email+app',
        subscribers: plan.subscribers.length,
        emailRecipients: plan.emailTargets.length,
        skippedInvalidEmail: plan.skippedInvalidEmail,
        appRecipients: plan.appRecipients.length,
        customMessage: Boolean(message?.trim()),
      },
      retryable: (result) => {
        const recorded = result as PromoResult | null
        return recorded?.sent === 0 && recorded.appNotifications === 0
      },
    })
    if (claim.kind === 'in_progress') return NextResponse.json({ error: 'in_progress' }, { status: 409 })
    if (claim.kind === 'replay') return NextResponse.json({ ok: true, replayed: true })

    // 2. SMTP after the claim committed.
    const { delivered, failed } = await sendProductNewsEmails(plan, news)

    // 3. The in-app notifications (with the email outcome) and the result event
    //    commit together. If the audit cannot be written the notifications are
    //    still created on their own; the key then stays in_progress, so a retry
    //    cannot send the emails again.
    const data = productNewsNotifications(plan, news, delivered)
    const result: PromoResult = {
      channel: 'email+app', sent: delivered.size, failed,
      skippedInvalidEmail: plan.skippedInvalidEmail, appNotifications: data.length,
    }
    try {
      await prisma.$transaction(async (tx) => {
        if (data.length > 0) await tx.userNotification.createMany({ data })
        try {
          await appendServerAudit(tx, req, actor, {
            action: PROMO_EVENTS.recorded, ...target, requestId: batchId, after: result,
          })
        } catch (error) {
          throw new PromoResultAuditError('Promo result audit failed before commit', { cause: error })
        }
      })
    } catch (error) {
      // Only fall back if the callback aborted before commit. A commit error
      // can be reported after the notifications have already been persisted.
      if (!(error instanceof PromoResultAuditError)) throw error
      logApiError('[admin/products/:id/notify-promo POST] result audit failed', error)
      if (data.length > 0) await prisma.userNotification.createMany({ data })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    logApiError('[admin/products/:id/notify-promo POST]', e)
    return NextResponse.json({ error: 'server_error' }, { status: 500 })
  }
}
