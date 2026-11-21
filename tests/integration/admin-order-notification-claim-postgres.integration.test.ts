import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { assertNotProductionDatabaseUrl } from '../../scripts/e2e-database-guard'

vi.mock('server-only', () => ({}))

const enabled = process.env.ALLOW_OUTBOX_DB_TESTS === 'isolated-neon-branch'
const suite = enabled ? describe : describe.skip
const orderIds: string[] = []
const MINUTE = 60 * 1000

suite('admin notification claims on isolated Postgres: immediate (after()) vs scheduled worker', () => {
  let prisma: typeof import('@/lib/prisma')['prisma']
  let enqueue: typeof import('@/lib/order-admin-notification-outbox')['enqueueAdminOrderNotification']
  let worker: typeof import('@/lib/order-admin-notification-worker')

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated outbox integration tests')
    assertNotProductionDatabaseUrl(process.env.DATABASE_URL, 'outbox integration tests')
    ;({ prisma } = await import('@/lib/prisma'))
    ;({ enqueueAdminOrderNotification: enqueue } = await import('@/lib/order-admin-notification-outbox'))
    worker = await import('@/lib/order-admin-notification-worker')
  })

  afterEach(async () => {
    if (!prisma || orderIds.length === 0) return
    await prisma.orderNotificationOutbox.deleteMany({ where: { orderId: { in: orderIds } } })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    orderIds.length = 0
  })

  afterAll(async () => {
    if (prisma) await prisma.$disconnect()
  })

  async function createQueuedOrder(enqueuedAt: Date): Promise<string> {
    const orderId = `claim-it-${randomUUID()}`
    orderIds.push(orderId)
    await prisma.$transaction(async (tx) => {
      await tx.order.create({ data: {
        id: orderId, createdAt: enqueuedAt, items: [], subtotal: 1, tax: 0, delivery: 0,
        deliveryMethod: 'pickup', paymentMethod: 'bank', discount: 0, total: 1,
        firstName: 'Synthetic', lastName: 'Claim', email: 'claim@example.invalid',
        phone: '000', address: 'Synthetic', city: 'Synthetic',
      } })
      await enqueue(tx, { orderId, source: 'checkout', now: enqueuedAt })
    })
    return orderId
  }

  const row = (orderId: string) => prisma.orderNotificationOutbox.findFirstOrThrow({ where: { orderId } })

  it('claims a fresh row immediately, before the scheduled initial delay has passed', async () => {
    const t0 = new Date()
    const orderId = await createQueuedOrder(t0)

    expect(await worker.claimAdminOrderNotifications(20, t0)).toEqual([])
    const claimed = await worker.claimAdminOrderNotificationForOrder(orderId, t0)

    expect(claimed).toEqual([expect.objectContaining({ orderId, attempts: 1, previousStatus: 'pending' })])
    expect(await row(orderId)).toMatchObject({ status: 'processing', attempts: 1 })
  })

  it('lets exactly one of many concurrent immediate and scheduled claims take the row', async () => {
    const t0 = new Date(Date.now() - 10 * MINUTE)
    const orderId = await createQueuedOrder(t0)
    const now = new Date()

    const results = await Promise.all(Array.from({ length: 12 }, (_, index) => index % 2 === 0
      ? worker.claimAdminOrderNotificationForOrder(orderId, now)
      : worker.claimAdminOrderNotifications(20, now).then((rows) => rows.filter((claimed) => claimed.orderId === orderId))))

    expect(results.flat()).toHaveLength(1)
    expect(await row(orderId)).toMatchObject({ status: 'processing', attempts: 1 })
  })

  it('leaves an interrupted immediate delivery to the scheduled stale-lease recovery', async () => {
    const t0 = new Date(Date.now() - 60 * MINUTE)
    const orderId = await createQueuedOrder(t0)
    await worker.claimAdminOrderNotificationForOrder(orderId, t0)

    // A repeated immediate dispatch never steals a held lease, not even a stale one.
    expect(await worker.claimAdminOrderNotificationForOrder(orderId, new Date())).toEqual([])
    expect((await worker.claimAdminOrderNotifications(20, new Date(t0.getTime() + 5 * MINUTE)))
      .filter((claimed) => claimed.orderId === orderId)).toEqual([])

    const recovered = (await worker.claimAdminOrderNotifications(20, new Date()))
      .filter((claimed) => claimed.orderId === orderId)
    expect(recovered).toEqual([expect.objectContaining({ previousStatus: 'processing', attempts: 1 })])
  })

  it('does not claim a retry: backoff after an SMTP failure stays with the scheduled worker', async () => {
    const t0 = new Date(Date.now() - 30 * MINUTE)
    const orderId = await createQueuedOrder(t0)
    const [job] = await worker.claimAdminOrderNotificationForOrder(orderId, t0)
    expect(await worker.markAdminOrderNotificationFailed(job, 'smtp_send_failed', new Date(t0.getTime() + MINUTE), t0)).toBe(true)

    expect(await worker.claimAdminOrderNotificationForOrder(orderId, new Date())).toEqual([])
    const retried = (await worker.claimAdminOrderNotifications(20, new Date()))
      .filter((claimed) => claimed.orderId === orderId)
    expect(retried).toEqual([expect.objectContaining({ previousStatus: 'pending', attempts: 2 })])
    expect(await worker.markAdminOrderNotificationSent(retried[0], new Date())).toBe(true)
    expect(await row(orderId)).toMatchObject({ status: 'sent', attempts: 2 })
  })

  it('never claims a row that is already sent', async () => {
    const t0 = new Date(Date.now() - 30 * MINUTE)
    const orderId = await createQueuedOrder(t0)
    const [job] = await worker.claimAdminOrderNotificationForOrder(orderId, t0)
    await worker.markAdminOrderNotificationSent(job, t0)

    expect(await worker.claimAdminOrderNotificationForOrder(orderId, new Date())).toEqual([])
    expect((await worker.claimAdminOrderNotifications(20, new Date(Date.now() + 60 * MINUTE)))
      .filter((claimed) => claimed.orderId === orderId)).toEqual([])
  })
})
