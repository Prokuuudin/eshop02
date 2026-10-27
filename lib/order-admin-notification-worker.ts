import 'server-only'

import { randomUUID } from 'node:crypto'
import { Prisma } from '@/generated/prisma/client'
import { mapDbToServerOrder } from '@/lib/orders-data-mapping'
import { sendAdminOrderNotificationEmail } from '@/lib/order-admin-notification'
import type { AdminOrderNotificationSource } from '@/lib/order-admin-notification-outbox'
import { ADMIN_ORDER_NOTIFICATION_TYPE } from '@/lib/order-admin-notification-outbox'
import { logOperationalEvent } from '@/lib/observability'
import { prisma } from '@/lib/prisma'
import type { ServerOrder } from '@/lib/orders-data-types'

export const ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS = 12
export const ADMIN_ORDER_NOTIFICATION_STALE_AFTER_MS = 15 * 60 * 1000
export const ADMIN_ORDER_NOTIFICATION_RETRY_BASE_MS = 60 * 1000
export const ADMIN_ORDER_NOTIFICATION_RETRY_CAP_MS = 6 * 60 * 60 * 1000
export const ADMIN_ORDER_NOTIFICATION_CONCURRENCY = 5

export type ClaimedAdminOrderNotification = {
  id: string
  orderId: string
  source: AdminOrderNotificationSource
  correlationId: string | null
  paymentStatusOverride: string | null
  attempts: number
  lockToken: string
  previousStatus: string
}

type DeliveryResult = 'sent' | 'not_configured' | 'failed'

export type AdminOrderNotificationWorkerDeps = {
  claim: (batchSize: number, now: Date) => Promise<ClaimedAdminOrderNotification[]>
  loadOrder: (orderId: string) => Promise<ServerOrder | null>
  deliver: (
    order: ServerOrder,
    context: {
      source: AdminOrderNotificationSource
      correlationId?: string
      outboxId: string
      attempt: number
    },
  ) => Promise<DeliveryResult>
  markSent: (job: ClaimedAdminOrderNotification, now: Date) => Promise<boolean>
  markFailed: (
    job: ClaimedAdminOrderNotification,
    errorCode: string,
    nextAttemptAt: Date | null,
    now: Date,
  ) => Promise<boolean>
  now: () => Date
}

export type AdminOrderNotificationWorkerResult = {
  claimed: number
  sent: number
  retryScheduled: number
  failed: number
  recovered: number
}

export function adminOrderNotificationRetryDelayMs(attempt: number): number {
  const exponent = Math.max(0, attempt - 1)
  return Math.min(
    ADMIN_ORDER_NOTIFICATION_RETRY_CAP_MS,
    ADMIN_ORDER_NOTIFICATION_RETRY_BASE_MS * (2 ** exponent),
  )
}

export async function claimAdminOrderNotifications(
  batchSize: number,
  now: Date,
): Promise<ClaimedAdminOrderNotification[]> {
  const safeBatchSize = Math.max(1, Math.min(100, Math.floor(batchSize)))
  const staleBefore = new Date(now.getTime() - ADMIN_ORDER_NOTIFICATION_STALE_AFTER_MS)
  const lockToken = randomUUID()

  return prisma.$queryRaw<ClaimedAdminOrderNotification[]>(Prisma.sql`
    WITH candidates AS (
      SELECT
        "id",
        "status" AS "previousStatus"
      FROM "OrderNotificationOutbox"
      WHERE "notificationType" = ${ADMIN_ORDER_NOTIFICATION_TYPE}
        AND (
          ("status" = 'pending'
            AND "attempts" < ${ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS}
            AND "nextAttemptAt" <= ${now})
          OR ("status" = 'processing'
            AND "attempts" <= ${ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS}
            AND "lockedAt" < ${staleBefore})
        )
      ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
      FOR UPDATE SKIP LOCKED
      LIMIT ${safeBatchSize}
    ), claimed AS (
      UPDATE "OrderNotificationOutbox" AS outbox
      SET
        "status" = 'processing',
        "attempts" = outbox."attempts" + CASE WHEN candidates."previousStatus" = 'pending' THEN 1 ELSE 0 END,
        "lockedAt" = ${now},
        "lockToken" = ${lockToken},
        "lastErrorCode" = NULL,
        "updatedAt" = ${now}
      FROM candidates
      WHERE outbox."id" = candidates."id"
      RETURNING
        outbox."id",
        outbox."orderId",
        outbox."source",
        outbox."correlationId",
        outbox."paymentStatusOverride",
        outbox."attempts",
        outbox."lockToken",
        candidates."previousStatus"
    )
    SELECT * FROM claimed
  `)
}

export async function loadAdminOrderNotificationOrder(orderId: string): Promise<ServerOrder | null> {
  const row = await prisma.order.findUnique({ where: { id: orderId } })
  return row ? mapDbToServerOrder(row) : null
}

export async function markAdminOrderNotificationSent(
  job: ClaimedAdminOrderNotification,
  now: Date,
): Promise<boolean> {
  const result = await prisma.orderNotificationOutbox.updateMany({
    where: { id: job.id, status: 'processing', lockToken: job.lockToken },
    data: {
      status: 'sent',
      sentAt: now,
      lockedAt: null,
      lockToken: null,
      lastErrorCode: null,
    },
  })
  return result.count === 1
}

export async function markAdminOrderNotificationFailed(
  job: ClaimedAdminOrderNotification,
  errorCode: string,
  nextAttemptAt: Date | null,
  now: Date,
): Promise<boolean> {
  const result = await prisma.orderNotificationOutbox.updateMany({
    where: { id: job.id, status: 'processing', lockToken: job.lockToken },
    data: {
      status: nextAttemptAt ? 'pending' : 'failed',
      nextAttemptAt: nextAttemptAt ?? now,
      lockedAt: null,
      lockToken: null,
      lastErrorCode: errorCode,
    },
  })
  return result.count === 1
}

const DEFAULT_DEPS: AdminOrderNotificationWorkerDeps = {
  claim: claimAdminOrderNotifications,
  loadOrder: loadAdminOrderNotificationOrder,
  deliver: sendAdminOrderNotificationEmail,
  markSent: markAdminOrderNotificationSent,
  markFailed: markAdminOrderNotificationFailed,
  now: () => new Date(),
}

export async function processAdminOrderNotificationOutbox(
  options: { batchSize?: number } = {},
  deps: AdminOrderNotificationWorkerDeps = DEFAULT_DEPS,
): Promise<AdminOrderNotificationWorkerResult> {
  const now = deps.now()
  const jobs = await deps.claim(options.batchSize ?? 20, now)
  const result: AdminOrderNotificationWorkerResult = {
    claimed: jobs.length,
    sent: 0,
    retryScheduled: 0,
    failed: 0,
    recovered: jobs.filter((job) => job.previousStatus === 'processing').length,
  }

  const processJob = async (job: ClaimedAdminOrderNotification): Promise<void> => {
    if (job.previousStatus === 'processing') {
      logOperationalEvent({
        event: 'order_admin_email_outbox_recovered',
        level: 'warn',
        orderId: job.orderId,
        outboxId: job.id,
        attempt: job.attempts,
      })
    }

    const storedOrder = await deps.loadOrder(job.orderId)
    const order = storedOrder && job.paymentStatusOverride && storedOrder.paymentStatus === 'unpaid'
      ? { ...storedOrder, paymentStatus: job.paymentStatusOverride as ServerOrder['paymentStatus'] }
      : storedOrder
    let deliveryResult: DeliveryResult = 'failed'
    let errorCode = 'order_missing'

    if (order) {
      try {
        deliveryResult = await deps.deliver(order, {
          source: job.source,
          correlationId: job.correlationId ?? undefined,
          outboxId: job.id,
          attempt: job.attempts,
        })
        errorCode = deliveryResult === 'not_configured' ? 'contact_to_missing' : 'smtp_send_failed'
      } catch {
        // The stage-1 sender is non-throwing, but this keeps the lease recoverable if a
        // future implementation or a test dependency violates that contract.
        deliveryResult = 'failed'
        errorCode = 'delivery_unhandled_error'
      }
    }

    if (deliveryResult === 'sent') {
      if (await deps.markSent(job, deps.now())) result.sent += 1
      return
    }

    const exhausted = job.attempts >= ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS
    const failureTime = deps.now()
    const nextAttemptAt = exhausted
      ? null
      : new Date(failureTime.getTime() + adminOrderNotificationRetryDelayMs(job.attempts))
    if (!await deps.markFailed(job, errorCode, nextAttemptAt, failureTime)) return

    if (exhausted) {
      result.failed += 1
      logOperationalEvent({
        event: 'order_admin_email_outbox_exhausted',
        level: 'error',
        alert: true,
        orderId: job.orderId,
        outboxId: job.id,
        attempt: job.attempts,
        reason: errorCode,
      })
    } else {
      result.retryScheduled += 1
      logOperationalEvent({
        event: 'order_admin_email_retry_scheduled',
        level: 'warn',
        orderId: job.orderId,
        outboxId: job.id,
        attempt: job.attempts,
        reason: errorCode,
        nextAttemptAt: nextAttemptAt?.toISOString(),
      })
    }
  }

  // A claimed row must not sit behind an entire slow SMTP batch: otherwise its lease
  // could expire before this process reaches it and another Plesk run could resend it.
  // Keep concurrency bounded so a temporary SMTP outage does not create an unbounded
  // connection storm.
  let nextJob = 0
  const workers = Array.from(
    { length: Math.min(ADMIN_ORDER_NOTIFICATION_CONCURRENCY, jobs.length) },
    async () => {
      while (nextJob < jobs.length) {
        const index = nextJob
        nextJob += 1
        await processJob(jobs[index])
      }
    },
  )
  await Promise.all(workers)

  return result
}
