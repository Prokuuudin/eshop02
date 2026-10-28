import { describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  orderNotificationOutbox: { updateMany: vi.fn() },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import {
  ADMIN_ORDER_NOTIFICATION_INITIAL_DELAY_MS,
  enqueueAdminOrderNotification,
  retryFailedAdminOrderNotification,
} from './order-admin-notification-outbox'

describe('admin order notification outbox store', () => {
  it('enqueues safe routing metadata on the supplied order transaction', async () => {
    const create = vi.fn().mockResolvedValue({})
    const now = new Date('2026-10-28T10:00:00.000Z')

    await enqueueAdminOrderNotification({ orderNotificationOutbox: { create } } as never, {
      orderId: '1201', source: 'api_v1', correlationId: 'cid-1201', now,
    })

    expect(create).toHaveBeenCalledWith({ data: {
      orderId: '1201',
      notificationType: 'admin_order_created',
      source: 'api_v1',
      correlationId: 'cid-1201',
      nextAttemptAt: new Date(now.getTime() + ADMIN_ORDER_NOTIFICATION_INITIAL_DELAY_MS),
    } })
  })

  it('manual retry resets only failed jobs and never targets sent rows', async () => {
    prismaMock.orderNotificationOutbox.updateMany.mockResolvedValue({ count: 1 })

    await expect(retryFailedAdminOrderNotification('1201')).resolves.toBe(true)

    expect(prismaMock.orderNotificationOutbox.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ orderId: '1201', status: 'failed' }),
      data: expect.objectContaining({ status: 'pending', attempts: 0, lockToken: null }),
    }))
  })
})
