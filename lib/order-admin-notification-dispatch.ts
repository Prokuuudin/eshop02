import 'server-only'

import { after } from 'next/server'
import { logOperationalEvent } from '@/lib/observability'
import {
  processAdminOrderNotificationForOrder,
  type AdminOrderNotificationWorkerResult,
} from '@/lib/order-admin-notification-worker'

export type ImmediateAdminOrderNotificationDeps = {
  schedule: (task: () => Promise<void>) => void
  dispatch: (orderId: string) => Promise<AdminOrderNotificationWorkerResult>
}

const DEFAULT_DEPS: ImmediateAdminOrderNotificationDeps = {
  schedule: after,
  dispatch: processAdminOrderNotificationForOrder,
}

const errorType = (error: unknown): string => error instanceof Error ? error.name : 'UnknownError'

/**
 * Sends the admin e-mail for a just-created order once the response has finished.
 *
 * This is a latency optimisation only. The outbox row written in the order transaction and
 * the Plesk scheduled worker stay the delivery guarantee: on the custom `server.js` the
 * `after()` callback lives only in the current process (Windows/iisnode restarts are not
 * graceful), so a restart, an unavailable `after()` or any failure here leaves the row
 * `pending` (or `processing`, recovered after the stale lease) for the scheduled worker.
 * Never throws into the order request. Error messages are not logged: SMTP and database
 * errors can contain credentials or personal data.
 */
export function scheduleImmediateAdminOrderNotification(
  orderId: string,
  correlationId?: string,
  deps: ImmediateAdminOrderNotificationDeps = DEFAULT_DEPS,
): void {
  try {
    deps.schedule(async () => {
      try {
        const result = await deps.dispatch(orderId)
        logOperationalEvent({ event: 'order_admin_email_immediate_dispatch_completed', correlationId, orderId, ...result })
      } catch (error) {
        logOperationalEvent({
          event: 'order_admin_email_immediate_dispatch_failed',
          level: 'warn',
          correlationId,
          orderId,
          errorType: errorType(error),
        })
      }
    })
  } catch (error) {
    logOperationalEvent({
      event: 'order_admin_email_immediate_dispatch_unavailable',
      level: 'warn',
      correlationId,
      orderId,
      errorType: errorType(error),
    })
  }
}
