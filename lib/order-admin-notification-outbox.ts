import 'server-only'

import { prisma, type ExtendedTransactionClient } from '@/lib/prisma'

export const ADMIN_ORDER_NOTIFICATION_TYPE = 'admin_order_created'
export const ADMIN_ORDER_NOTIFICATION_INITIAL_DELAY_MS = 2 * 60 * 1000

export type AdminOrderNotificationSource = 'checkout' | 'admin' | 'api_v1'

export type EnqueueAdminOrderNotificationInput = {
  orderId: string
  source: AdminOrderNotificationSource
  correlationId?: string
  now?: Date
}

/**
 * Must be called with the same interactive transaction that creates the order.
 * The unique key is a second line of defence in addition to checkout idempotency.
 */
export async function enqueueAdminOrderNotification(
  tx: ExtendedTransactionClient,
  input: EnqueueAdminOrderNotificationInput,
): Promise<void> {
  const now = input.now ?? new Date()
  await tx.orderNotificationOutbox.create({
    data: {
      orderId: input.orderId,
      notificationType: ADMIN_ORDER_NOTIFICATION_TYPE,
      source: input.source,
      correlationId: input.correlationId,
      nextAttemptAt: new Date(now.getTime() + ADMIN_ORDER_NOTIFICATION_INITIAL_DELAY_MS),
    },
  })
}

/**
 * Paysera can prove that a payment exists while local reconciliation is still pending.
 * This changes notification metadata only; it never changes the order or payment state.
 */
export async function setAdminOrderNotificationPaymentStatusOverride(
  orderId: string,
  paymentStatus: 'pending' | 'failed',
): Promise<void> {
  await prisma.orderNotificationOutbox.updateMany({
    where: {
      orderId,
      notificationType: ADMIN_ORDER_NOTIFICATION_TYPE,
      status: { in: ['pending', 'processing', 'failed'] },
    },
    data: { paymentStatusOverride: paymentStatus },
  })
}

/** Manual recovery is deliberately unable to replay an already-sent notification. */
export async function retryFailedAdminOrderNotification(
  orderId: string,
  db: Pick<ExtendedTransactionClient, 'orderNotificationOutbox'> = prisma,
): Promise<boolean> {
  const result = await db.orderNotificationOutbox.updateMany({
    where: {
      orderId,
      notificationType: ADMIN_ORDER_NOTIFICATION_TYPE,
      status: 'failed',
    },
    data: {
      status: 'pending',
      attempts: 0,
      nextAttemptAt: new Date(),
      lockedAt: null,
      lockToken: null,
      lastErrorCode: null,
    },
  })
  return result.count === 1
}
