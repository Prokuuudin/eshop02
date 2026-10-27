import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/order-admin-notification', () => ({ sendAdminOrderNotificationEmail: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logOperationalEvent: vi.fn() }))

import type { ServerOrder } from '@/lib/orders-data-types'
import {
  ADMIN_ORDER_NOTIFICATION_CONCURRENCY,
  ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS,
  adminOrderNotificationRetryDelayMs,
  processAdminOrderNotificationOutbox,
  type AdminOrderNotificationWorkerDeps,
  type ClaimedAdminOrderNotification,
} from './order-admin-notification-worker'

const NOW = new Date('2026-10-28T10:00:00.000Z')
const ORDER = { id: '1201', paymentStatus: 'unpaid' } as ServerOrder

function job(overrides: Partial<ClaimedAdminOrderNotification> = {}): ClaimedAdminOrderNotification {
  return {
    id: 'outbox-1', orderId: '1201', source: 'checkout', correlationId: 'cid-1201',
    paymentStatusOverride: null, attempts: 1, lockToken: 'lock-1', previousStatus: 'pending',
    ...overrides,
  }
}

function deps(overrides: Partial<AdminOrderNotificationWorkerDeps> = {}) {
  const value: AdminOrderNotificationWorkerDeps = {
    claim: vi.fn().mockResolvedValue([job()]),
    loadOrder: vi.fn().mockResolvedValue(ORDER),
    deliver: vi.fn().mockResolvedValue('sent'),
    markSent: vi.fn().mockResolvedValue(true),
    markFailed: vi.fn().mockResolvedValue(true),
    now: vi.fn(() => NOW),
    ...overrides,
  }
  return value
}

beforeEach(() => vi.clearAllMocks())

describe('admin order notification outbox worker', () => {
  it('marks a successfully delivered job sent without changing the order', async () => {
    const snapshot = structuredClone(ORDER)
    const worker = deps()

    await expect(processAdminOrderNotificationOutbox({}, worker)).resolves.toEqual({
      claimed: 1, sent: 1, retryScheduled: 0, failed: 0, recovered: 0,
    })

    expect(worker.markSent).toHaveBeenCalledWith(expect.objectContaining({ id: 'outbox-1' }), NOW)
    expect(worker.markFailed).not.toHaveBeenCalled()
    expect(ORDER).toEqual(snapshot)
  })

  it('keeps the job retryable after SMTP failure and applies exponential delay', async () => {
    const worker = deps({ deliver: vi.fn().mockResolvedValue('failed') })

    const result = await processAdminOrderNotificationOutbox({}, worker)

    expect(result).toMatchObject({ retryScheduled: 1, failed: 0 })
    expect(worker.markFailed).toHaveBeenCalledWith(
      expect.any(Object),
      'smtp_send_failed',
      new Date(NOW.getTime() + adminOrderNotificationRetryDelayMs(1)),
      NOW,
    )
  })

  it('retries missing CONTACT_TO safely instead of losing the job', async () => {
    const worker = deps({ deliver: vi.fn().mockResolvedValue('not_configured') })

    await processAdminOrderNotificationOutbox({}, worker)

    expect(worker.markFailed).toHaveBeenCalledWith(
      expect.any(Object), 'contact_to_missing', expect.any(Date), NOW,
    )
  })

  it('recovers a stale processing lease after restart', async () => {
    const worker = deps({ claim: vi.fn().mockResolvedValue([job({ previousStatus: 'processing', attempts: 2 })]) })

    const result = await processAdminOrderNotificationOutbox({}, worker)

    expect(result).toMatchObject({ recovered: 1, sent: 1 })
    expect(worker.deliver).toHaveBeenCalledOnce()
  })

  it('allows only one of two parallel handlers to deliver the claimed row', async () => {
    let available = true
    const claim = vi.fn(async () => {
      if (!available) return []
      available = false
      return [job()]
    })
    const deliver = vi.fn().mockResolvedValue('sent')
    const worker = deps({ claim, deliver })

    const results = await Promise.all([
      processAdminOrderNotificationOutbox({}, worker),
      processAdminOrderNotificationOutbox({}, worker),
    ])

    expect(results.reduce((sum, value) => sum + value.sent, 0)).toBe(1)
    expect(deliver).toHaveBeenCalledOnce()
  })

  it('starts a claimed batch with bounded concurrency so leases do not wait behind slow SMTP', async () => {
    const jobs = Array.from({ length: 9 }, (_, index) => job({
      id: `outbox-${index}`,
      orderId: `order-${index}`,
      lockToken: `lock-${index}`,
    }))
    let active = 0
    let maximumActive = 0
    const deliver = vi.fn(async () => {
      active += 1
      maximumActive = Math.max(maximumActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return 'sent' as const
    })
    const worker = deps({ claim: vi.fn().mockResolvedValue(jobs), deliver })

    const result = await processAdminOrderNotificationOutbox({}, worker)

    expect(result.sent).toBe(9)
    expect(maximumActive).toBe(ADMIN_ORDER_NOTIFICATION_CONCURRENCY)
    expect(maximumActive).toBeLessThanOrEqual(ADMIN_ORDER_NOTIFICATION_CONCURRENCY)
  })

  it('moves an exhausted job to failed and does not schedule another attempt', async () => {
    const worker = deps({
      claim: vi.fn().mockResolvedValue([job({ attempts: ADMIN_ORDER_NOTIFICATION_MAX_ATTEMPTS })]),
      deliver: vi.fn().mockResolvedValue('failed'),
    })

    const result = await processAdminOrderNotificationOutbox({}, worker)

    expect(result).toMatchObject({ failed: 1, retryScheduled: 0 })
    expect(worker.markFailed).toHaveBeenCalledWith(
      expect.any(Object), 'smtp_send_failed', null, NOW,
    )
  })

  it('uses the Paysera status hint in the message without mutating the stored order', async () => {
    const deliver = vi.fn().mockResolvedValue('sent')
    const worker = deps({
      claim: vi.fn().mockResolvedValue([job({ paymentStatusOverride: 'failed' })]),
      deliver,
    })

    await processAdminOrderNotificationOutbox({}, worker)

    expect(deliver).toHaveBeenCalledWith(
      expect.objectContaining({ paymentStatus: 'failed' }),
      expect.objectContaining({ outboxId: 'outbox-1', attempt: 1 }),
    )
    expect(ORDER.paymentStatus).toBe('unpaid')
  })
})
