import { NextRequest, NextResponse } from 'next/server'
import { retryFailedAdminOrderNotification } from '@/lib/order-admin-notification-outbox'
import { getCorrelationId, logOperationalEvent } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import { appendServerAudit } from '@/lib/server-audit'
import { requireAdminPermission } from '@/lib/server-auth'

export const runtime = 'nodejs'

export async function POST(request: NextRequest): Promise<NextResponse> {
  const correlationId = getCorrelationId(request)
  const admin = await requireAdminPermission('orders.update')
  if (admin instanceof NextResponse) return admin

  let orderId: string
  try {
    const body = await request.json() as { orderId?: unknown }
    orderId = typeof body.orderId === 'string' ? body.orderId.trim() : ''
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }
  if (!/^[a-zA-Z0-9_-]{1,64}$/u.test(orderId)) {
    return NextResponse.json({ error: 'invalid_order_id' }, { status: 400 })
  }

  let queued: boolean
  try {
    queued = await prisma.$transaction(async (tx) => {
      const retried = await retryFailedAdminOrderNotification(orderId, tx)
      if (!retried) return false
      await appendServerAudit(tx, request, admin, {
        action: 'order.admin_notification_retry',
        entityType: 'order',
        entityId: orderId,
        entityTitle: orderId,
        details: 'Failed admin order notification queued for retry',
      })
      return true
    })
  } catch (error) {
    logOperationalEvent({
      event: 'order_admin_email_manual_retry_failed',
      level: 'error',
      alert: true,
      correlationId,
      orderId,
      errorType: error instanceof Error ? error.name : 'UnknownError',
    })
    return NextResponse.json({ error: 'retry_failed' }, { status: 500 })
  }

  if (!queued) {
    return NextResponse.json({ error: 'notification_not_retryable' }, { status: 409 })
  }

  logOperationalEvent({
    event: 'order_admin_email_manual_retry_queued',
    correlationId,
    orderId,
    adminId: admin.id,
  })
  return NextResponse.json({ queued: true, orderId }, { status: 202 })
}
