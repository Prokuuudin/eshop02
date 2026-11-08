import 'server-only'

import {
  ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS,
  ADMIN_ORDER_NOTIFICATION_TYPE,
} from '@/lib/order-admin-notification-constants'

/**
 * Cheap pre-check for the every-minute outbox run, executed before Prisma and the worker
 * are loaded (they cost ~1 s CPU per process start even when the queue is empty).
 *
 * The condition is a superset of claimAdminOrderNotifications: it keeps the status and
 * attempt bounds and drops the time conditions (nextAttemptAt, stale lockedAt). It can
 * only say "maybe work" more often than the claim, never less, and it compares no
 * timestamps, so clock or time-zone handling cannot hide a due row. Claiming, locks,
 * retries and stale-lease recovery stay in the worker unchanged.
 */
export const OPEN_ADMIN_ORDER_NOTIFICATION_WORK_SQL = `
  SELECT EXISTS (
    SELECT 1 FROM "OrderNotificationOutbox"
    WHERE "notificationType" = $1
      AND (("status" = 'pending' AND "attempts" < $2)
        OR ("status" = 'processing' AND "attempts" <= $2))
  ) AS "open"`

export type OutboxProbeQuery = (url: string, text: string, params: unknown[]) => Promise<Array<{ open: unknown }>>

const neonHttpQuery: OutboxProbeQuery = async (url, text, params) => {
  const { neon } = await import('@neondatabase/serverless')
  return (await neon(url).query(text, params)) as Array<{ open: unknown }>
}

/**
 * true/false when known; null when the probe cannot answer (no or non-Neon database URL,
 * network or query error). Callers run the full worker on null.
 */
export async function hasOpenAdminOrderNotificationWork(
  env: { DATABASE_URL?: string } = { DATABASE_URL: process.env.DATABASE_URL },
  query: OutboxProbeQuery = neonHttpQuery,
): Promise<boolean | null> {
  const url = env.DATABASE_URL
  if (!url) return null
  let hostname: string
  try {
    hostname = new URL(url).hostname.toLowerCase()
  } catch {
    return null
  }
  // The HTTP driver only reaches Neon; local/self-hosted PostgreSQL goes the full path.
  if (!hostname.endsWith('.neon.tech')) return null
  try {
    const rows = await query(url, OPEN_ADMIN_ORDER_NOTIFICATION_WORK_SQL, [
      ADMIN_ORDER_NOTIFICATION_TYPE,
      ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS,
    ])
    const open = rows[0]?.open
    return typeof open === 'boolean' ? open : null
  } catch {
    return null
  }
}
