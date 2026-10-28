import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'

vi.mock('server-only', () => ({}))

const enabled = process.env.ALLOW_OUTBOX_DB_TESTS === 'isolated-neon-branch'
const suite = enabled ? describe : describe.skip
const orderIds: string[] = []

suite('admin order notification outbox on isolated Postgres', () => {
  let prisma: typeof import('@/lib/prisma')['prisma']
  let enqueue: typeof import('@/lib/order-admin-notification-outbox')['enqueueAdminOrderNotification']
  let claim: typeof import('@/lib/order-admin-notification-worker')['claimAdminOrderNotifications']
  let processOutbox: typeof import('@/lib/order-admin-notification-worker')['processAdminOrderNotificationOutbox']
  let loadOrder: typeof import('@/lib/order-admin-notification-worker')['loadAdminOrderNotificationOrder']
  let markSent: typeof import('@/lib/order-admin-notification-worker')['markAdminOrderNotificationSent']
  let markFailed: typeof import('@/lib/order-admin-notification-worker')['markAdminOrderNotificationFailed']

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated outbox integration tests')
    ;({ prisma } = await import('@/lib/prisma'))
    ;({ enqueueAdminOrderNotification: enqueue } = await import('@/lib/order-admin-notification-outbox'))
    ;({
      claimAdminOrderNotifications: claim,
      processAdminOrderNotificationOutbox: processOutbox,
      loadAdminOrderNotificationOrder: loadOrder,
      markAdminOrderNotificationSent: markSent,
      markAdminOrderNotificationFailed: markFailed,
    } = await import('@/lib/order-admin-notification-worker'))
  })

  afterEach(async () => {
    if (!prisma || orderIds.length === 0) return
    await prisma.orderNotificationOutbox.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    orderIds.length = 0
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.$disconnect()
  })

  async function createOrderWithOutbox(source: 'checkout' | 'admin' | 'api_v1') {
    const orderId = `outbox-it-${randomUUID()}`
    orderIds.push(orderId)
    await prisma.$transaction(async (tx) => {
      await tx.order.create({ data: {
        id: orderId,
        createdAt: new Date(),
        items: [],
        subtotal: 10,
        tax: 0,
        delivery: 0,
        deliveryMethod: 'pickup',
        paymentMethod: source === 'checkout' ? 'paysera' : 'bank',
        discount: 0,
        total: 10,
        firstName: 'Synthetic',
        lastName: 'Outbox',
        email: 'outbox@example.invalid',
        phone: '000',
        address: 'Synthetic',
        city: 'Synthetic',
        paymentStatus: 'unpaid',
        paymentProvider: source === 'checkout' ? 'paysera' : 'manual',
      } })
      await enqueue(tx, { orderId, source, now: new Date(0) })
    })
    return orderId
  }

  it.each(['checkout', 'admin', 'api_v1'] as const)(
    'commits the %s order and its outbox row in one transaction',
    async source => {
      const orderId = await createOrderWithOutbox(source)
      const row = await prisma.orderNotificationOutbox.findUnique({
        where: { orderId_notificationType: { orderId, notificationType: 'admin_order_created' } },
      })
      expect(row).toMatchObject({ orderId, source, status: 'pending', attempts: 0 })
    },
  )

  it('rolls back the order when the outbox insert in the same transaction fails', async () => {
    const orderId = `outbox-it-${randomUUID()}`
    orderIds.push(orderId)

    await expect(prisma.$transaction(async (tx) => {
      await tx.order.create({ data: {
        id: orderId, createdAt: new Date(), items: [], subtotal: 1, tax: 0, delivery: 0,
        deliveryMethod: 'pickup', paymentMethod: 'bank', discount: 0, total: 1,
        firstName: 'Synthetic', lastName: 'Rollback', email: 'rollback@example.invalid',
        phone: '000', address: 'Synthetic', city: 'Synthetic',
      } })
      await enqueue(tx, { orderId, source: 'checkout', now: new Date(0) })
      await enqueue(tx, { orderId, source: 'checkout', now: new Date(0) })
    })).rejects.toMatchObject({ code: 'P2002' })

    expect(await prisma.order.findUnique({ where: { id: orderId } })).toBeNull()
    expect(await prisma.orderNotificationOutbox.count({ where: { orderId } })).toBe(0)
  })

  it('lets only one parallel handler claim a notification', async () => {
    const orderId = await createOrderWithOutbox('checkout')
    const now = new Date()

    const claimed = (await Promise.all([claim(1, now), claim(1, now)])).flat()

    expect(claimed.filter((row) => row.orderId === orderId)).toHaveLength(1)
  })

  it('recovers a stale processing row after a worker restart', async () => {
    const orderId = await createOrderWithOutbox('checkout')
    const stale = new Date(Date.now() - 60 * 60 * 1000)
    await prisma.orderNotificationOutbox.update({
      where: { orderId_notificationType: { orderId, notificationType: 'admin_order_created' } },
      data: { status: 'processing', lockedAt: stale, lockToken: 'dead-worker' },
    })

    const recovered = await claim(20, new Date())

    expect(recovered).toContainEqual(expect.objectContaining({ orderId, previousStatus: 'processing' }))
  })

  it('persists an SMTP retry without changing the order payment status', async () => {
    const orderId = await createOrderWithOutbox('checkout')
    const deliver = vi.fn().mockResolvedValue('failed')

    const result = await processOutbox({ batchSize: 20 }, {
      claim,
      loadOrder,
      deliver,
      markSent,
      markFailed,
      now: () => new Date(),
    })

    const row = await prisma.orderNotificationOutbox.findUnique({
      where: { orderId_notificationType: { orderId, notificationType: 'admin_order_created' } },
    })
    const order = await prisma.order.findUnique({ where: { id: orderId } })
    expect(result.retryScheduled).toBeGreaterThanOrEqual(1)
    expect(row).toMatchObject({ status: 'pending', attempts: 1, lastErrorCode: 'smtp_send_failed' })
    expect(row!.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
    expect(order?.paymentStatus).toBe('unpaid')
  })
})
