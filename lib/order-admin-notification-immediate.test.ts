import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
const queryRaw = vi.fn()
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: (...args: unknown[]) => queryRaw(...args) } }))
vi.mock('@/lib/order-admin-notification', () => ({ sendAdminOrderNotificationEmail: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))
vi.mock('next/server', () => ({ after: vi.fn() }))

import { logOperationalEvent } from '@/lib/observability'
import type { ServerOrder } from '@/lib/orders-data-types'
import { scheduleImmediateAdminOrderNotification } from './order-admin-notification-dispatch'
import {
  ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS,
  ADMIN_ORDER_NOTIFICATION_STALE_AFTER_MS,
  adminOrderNotificationRetryDelayMs,
  claimAdminOrderNotificationForOrder,
  processAdminOrderNotificationForOrder,
  processAdminOrderNotificationOutbox,
  type AdminOrderNotificationWorkerDeps,
  type ClaimedAdminOrderNotification,
} from './order-admin-notification-worker'

const T0 = new Date('2026-11-21T10:00:00.000Z')
const INITIAL_DELAY_MS = 2 * 60 * 1000
const ORDER = { id: '1301', paymentStatus: 'unpaid' } as ServerOrder

/**
 * In-memory model of one OrderNotificationOutbox row. The claim functions mirror the
 * WHERE clauses of the two SQL claims; a JS claim is atomic like the single SQL
 * statement with FOR UPDATE SKIP LOCKED. Real Postgres concurrency is covered by
 * tests/integration/admin-order-notification-claim-postgres.integration.test.ts.
 */
function outboxStore() {
  const row = {
    id: 'outbox-1301', orderId: ORDER.id, source: 'checkout' as const, correlationId: 'cid-1301',
    paymentStatusOverride: null as string | null, status: 'pending', attempts: 0,
    nextAttemptAt: new Date(T0.getTime() + INITIAL_DELAY_MS), lockedAt: null as Date | null,
    lockToken: null as string | null, lastErrorCode: null as string | null,
  }
  let tokens = 0
  const take = (now: Date): ClaimedAdminOrderNotification[] => {
    const previousStatus = row.status
    row.attempts += previousStatus === 'pending' ? 1 : 0
    row.status = 'processing'
    row.lockedAt = now
    row.lockToken = `lock-${++tokens}`
    return [{
      id: row.id, orderId: row.orderId, source: row.source, correlationId: row.correlationId,
      paymentStatusOverride: row.paymentStatusOverride, attempts: row.attempts,
      lockToken: row.lockToken, previousStatus,
    }]
  }
  const claimForOrder = async (orderId: string, now: Date) =>
    orderId === row.orderId && row.status === 'pending' && row.attempts === 0 ? take(now) : []
  const claimScheduled = async (_batchSize: number, now: Date) => {
    const due = row.status === 'pending' && row.attempts < ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS
      && row.nextAttemptAt <= now
    const stale = row.status === 'processing' && row.attempts <= ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS
      && row.lockedAt !== null && row.lockedAt.getTime() < now.getTime() - ADMIN_ORDER_NOTIFICATION_STALE_AFTER_MS
    return due || stale ? take(now) : []
  }
  const markSent = async (job: ClaimedAdminOrderNotification) => {
    if (row.status !== 'processing' || row.lockToken !== job.lockToken) return false
    Object.assign(row, { status: 'sent', lockedAt: null, lockToken: null, lastErrorCode: null })
    return true
  }
  const markFailed = async (job: ClaimedAdminOrderNotification, errorCode: string, nextAttemptAt: Date | null, now: Date) => {
    if (row.status !== 'processing' || row.lockToken !== job.lockToken) return false
    Object.assign(row, {
      status: nextAttemptAt ? 'pending' : 'failed', nextAttemptAt: nextAttemptAt ?? now,
      lockedAt: null, lockToken: null, lastErrorCode: errorCode,
    })
    return true
  }
  return { row, claimForOrder, claimScheduled, markSent, markFailed }
}

function workerDeps(
  store: ReturnType<typeof outboxStore>,
  claim: AdminOrderNotificationWorkerDeps['claim'],
  clock: { now: Date },
  overrides: Partial<AdminOrderNotificationWorkerDeps> = {},
): AdminOrderNotificationWorkerDeps {
  return {
    claim,
    loadOrder: vi.fn().mockResolvedValue(ORDER),
    deliver: vi.fn().mockResolvedValue('sent'),
    markSent: store.markSent,
    markFailed: store.markFailed,
    now: () => clock.now,
    ...overrides,
  }
}

const immediate = (store: ReturnType<typeof outboxStore>, clock: { now: Date }, overrides = {}) =>
  workerDeps(store, (_batchSize, now) => store.claimForOrder(ORDER.id, now), clock, overrides)
const scheduled = (store: ReturnType<typeof outboxStore>, clock: { now: Date }, overrides = {}) =>
  workerDeps(store, store.claimScheduled, clock, overrides)

beforeEach(() => {
  vi.clearAllMocks()
  queryRaw.mockReset()
})

describe('immediate admin order notification after the order request', () => {
  it('sends the new order notification at once, ignoring the scheduled initial delay', async () => {
    const store = outboxStore()
    const clock = { now: new Date(T0.getTime() + 1_000) }
    const deps = immediate(store, clock)

    await expect(processAdminOrderNotificationOutbox({ batchSize: 1 }, deps)).resolves.toEqual({
      claimed: 1, sent: 1, retryScheduled: 0, failed: 0, recovered: 0,
    })
    expect(deps.deliver).toHaveBeenCalledTimes(1)
    expect(store.row.status).toBe('sent')
  })

  it('leaves the row queued after an SMTP failure and lets the scheduled worker retry it', async () => {
    const store = outboxStore()
    const clock = { now: new Date(T0.getTime() + 1_000) }
    const failing = immediate(store, clock, { deliver: vi.fn().mockResolvedValue('failed') })

    await expect(processAdminOrderNotificationOutbox({ batchSize: 1 }, failing)).resolves.toMatchObject({
      claimed: 1, sent: 0, retryScheduled: 1,
    })
    expect(store.row).toMatchObject({ status: 'pending', attempts: 1, lastErrorCode: 'smtp_send_failed' })
    expect(store.row.nextAttemptAt).toEqual(new Date(clock.now.getTime() + adminOrderNotificationRetryDelayMs(1)))

    // The immediate path never touches a retry: backoff stays owned by the scheduled worker.
    await expect(processAdminOrderNotificationOutbox({ batchSize: 1 }, immediate(store, clock)))
      .resolves.toMatchObject({ claimed: 0 })

    clock.now = new Date(T0.getTime() + 15 * 60 * 1000)
    const retry = scheduled(store, clock)
    await expect(processAdminOrderNotificationOutbox({}, retry)).resolves.toMatchObject({ claimed: 1, sent: 1 })
    expect(store.row).toMatchObject({ status: 'sent', attempts: 2 })
  })

  it('recovers a delivery interrupted by an app restart through the scheduled worker', async () => {
    const store = outboxStore()
    const clock = { now: new Date(T0.getTime() + 1_000) }
    // The process dies after the claim: the lease is never released by this run.
    const claimed = await store.claimForOrder(ORDER.id, clock.now)
    expect(claimed).toHaveLength(1)

    clock.now = new Date(T0.getTime() + 10 * 60 * 1000)
    const tooEarly = scheduled(store, clock)
    await expect(processAdminOrderNotificationOutbox({}, tooEarly)).resolves.toMatchObject({ claimed: 0 })
    expect(tooEarly.deliver).not.toHaveBeenCalled()

    clock.now = new Date(T0.getTime() + 30 * 60 * 1000)
    const recovery = scheduled(store, clock)
    await expect(processAdminOrderNotificationOutbox({}, recovery)).resolves.toMatchObject({
      claimed: 1, sent: 1, recovered: 1,
    })
    expect(store.row).toMatchObject({ status: 'sent', attempts: 1 })
  })

  it('delivers once when the immediate and the scheduled handler run at the same time', async () => {
    const store = outboxStore()
    const clock = { now: new Date(T0.getTime() + INITIAL_DELAY_MS + 1_000) }
    const deliver = vi.fn().mockResolvedValue('sent')

    const results = await Promise.all([
      processAdminOrderNotificationOutbox({ batchSize: 1 }, immediate(store, clock, { deliver })),
      processAdminOrderNotificationOutbox({}, scheduled(store, clock, { deliver })),
    ])

    expect(deliver).toHaveBeenCalledTimes(1)
    expect(results.reduce((sum, result) => sum + result.sent, 0)).toBe(1)
    expect(store.row.status).toBe('sent')
  })

  it('claims only the first never-attempted pending row of the given order', async () => {
    queryRaw.mockResolvedValue([])

    await expect(claimAdminOrderNotificationForOrder('1301', T0)).resolves.toEqual([])

    const [query] = queryRaw.mock.calls[0] as [{ sql: string; values: unknown[] }]
    const sql = query.sql.replace(/\s+/g, ' ')
    expect(sql).toContain('"orderId" = ?')
    expect(sql).toContain(`"status" = 'pending'`)
    expect(sql).toContain('"attempts" = 0')
    expect(sql).toContain('FOR UPDATE SKIP LOCKED')
    expect(sql).not.toContain('"nextAttemptAt" <=')
    expect(query.values).toContain('1301')
    expect(query.values).toContain('admin_order_created')
  })

  it('processes the given order through the order-scoped claim', async () => {
    queryRaw.mockResolvedValue([])

    await expect(processAdminOrderNotificationForOrder('1301')).resolves.toEqual({
      claimed: 0, sent: 0, retryScheduled: 0, failed: 0, recovered: 0,
    })
    expect((queryRaw.mock.calls[0] as [{ values: unknown[] }])[0].values).toContain('1301')
  })
})

describe('scheduleImmediateAdminOrderNotification', () => {
  it('defers dispatch until the response has finished, then logs the result', async () => {
    let task: (() => Promise<void>) | undefined
    const dispatch = vi.fn().mockResolvedValue({ claimed: 1, sent: 1, retryScheduled: 0, failed: 0, recovered: 0 })

    scheduleImmediateAdminOrderNotification('1301', 'cid-1301', { schedule: (callback) => { task = callback }, dispatch })

    expect(dispatch).not.toHaveBeenCalled()
    await task?.()
    expect(dispatch).toHaveBeenCalledWith('1301')
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'order_admin_email_immediate_dispatch_completed', orderId: '1301', correlationId: 'cid-1301', sent: 1,
    }))
  })

  it('swallows a dispatch failure: the queued row stays for the scheduled worker', async () => {
    let task: (() => Promise<void>) | undefined
    const dispatch = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED secret-host'))

    scheduleImmediateAdminOrderNotification('1301', undefined, { schedule: (callback) => { task = callback }, dispatch })

    await expect(task?.()).resolves.toBeUndefined()
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'order_admin_email_immediate_dispatch_failed', level: 'warn', orderId: '1301', errorType: 'Error',
    }))
    expect(JSON.stringify(vi.mocked(logOperationalEvent).mock.calls)).not.toContain('secret-host')
  })

  it('never fails the order request when after() is unavailable', () => {
    const dispatch = vi.fn()

    expect(() => scheduleImmediateAdminOrderNotification('1301', 'cid-1301', {
      schedule: () => { throw new Error('`after` was called outside a request scope') },
      dispatch,
    })).not.toThrow()
    expect(dispatch).not.toHaveBeenCalled()
    expect(logOperationalEvent).toHaveBeenCalledWith(expect.objectContaining({
      event: 'order_admin_email_immediate_dispatch_unavailable', level: 'warn', orderId: '1301',
    }))
  })
})
