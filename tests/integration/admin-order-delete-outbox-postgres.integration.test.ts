import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({
  requireAdminPermission: vi.fn(async () => ({ id: 'admin-it', email: 'admin@example.invalid', platformRole: 'admin' })),
}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))

const enabled = process.env.ALLOW_OUTBOX_DB_TESTS === 'isolated-neon-branch'
const suite = enabled ? describe : describe.skip
const orderIds: string[] = []

suite('DELETE /api/admin/orders with the admin notification outbox on isolated Postgres', () => {
  let prisma: typeof import('@/lib/prisma')['prisma']
  let enqueue: typeof import('@/lib/order-admin-notification-outbox')['enqueueAdminOrderNotification']
  let DELETE: typeof import('@/app/api/admin/orders/route')['DELETE']

  beforeAll(async () => {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for isolated outbox integration tests')
    ;({ prisma } = await import('@/lib/prisma'))
    ;({ enqueueAdminOrderNotification: enqueue } = await import('@/lib/order-admin-notification-outbox'))
    ;({ DELETE } = await import('@/app/api/admin/orders/route'))
  })

  afterEach(async () => {
    if (!prisma || orderIds.length === 0) return
    const where = { orderId: { in: orderIds } }
    await prisma.orderOperationalException.deleteMany({ where })
    await prisma.orderNotificationOutbox.deleteMany({ where })
    await prisma.orderStatusRecord.deleteMany({ where })
    await prisma.order.deleteMany({ where: { id: { in: orderIds } } })
    orderIds.length = 0
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.$disconnect()
  })

  async function createOrder(options: { status: string; outbox: boolean }) {
    const orderId = `delete-it-${randomUUID()}`
    orderIds.push(orderId)
    await prisma.$transaction(async (tx) => {
      await tx.order.create({ data: {
        id: orderId, createdAt: new Date(), items: [], subtotal: 1, tax: 0, delivery: 0,
        deliveryMethod: 'pickup', paymentMethod: 'bank', discount: 0, total: 1,
        firstName: 'Synthetic', lastName: 'Delete', email: 'delete@example.invalid',
        phone: '000', address: 'Synthetic', city: 'Synthetic',
      } })
      await tx.orderStatusRecord.create({ data: { orderId, status: options.status } })
      if (options.outbox) await enqueue(tx, { orderId, source: 'admin', now: new Date(0) })
    })
    return orderId
  }

  const deleteOrder = (orderId: string) =>
    DELETE(new NextRequest(`http://localhost/api/admin/orders?orderId=${orderId}`, { method: 'DELETE' }))

  const outboxCount = (orderId: string) => prisma.orderNotificationOutbox.count({ where: { orderId } })

  it('deletes a cancelled order together with its outbox row', async () => {
    const orderId = await createOrder({ status: 'cancelled', outbox: true })

    const res = await deleteOrder(orderId)

    expect(res.status).toBe(200)
    expect(await prisma.order.findUnique({ where: { id: orderId } })).toBeNull()
    expect(await outboxCount(orderId)).toBe(0)
  })

  it('deletes a cancelled order that has no outbox row', async () => {
    const orderId = await createOrder({ status: 'cancelled', outbox: false })

    const res = await deleteOrder(orderId)

    expect(res.status).toBe(200)
    expect(await prisma.order.findUnique({ where: { id: orderId } })).toBeNull()
  })

  it('rolls the outbox delete back when the order delete fails later in the transaction', async () => {
    const orderId = await createOrder({ status: 'cancelled', outbox: true })
    // Another ON DELETE RESTRICT child makes the final order delete fail after the outbox delete.
    await prisma.orderOperationalException.create({ data: { orderId, code: 'delete_it_blocker', productIds: [] } })

    const res = await deleteOrder(orderId)

    expect(res.status).toBe(500)
    expect(await prisma.order.findUnique({ where: { id: orderId } })).not.toBeNull()
    expect(await prisma.orderStatusRecord.findUnique({ where: { orderId } })).toMatchObject({ status: 'cancelled' })
    expect(await outboxCount(orderId)).toBe(1)
  })

  it('still refuses to delete an order that is not cancelled and keeps its outbox row', async () => {
    const orderId = await createOrder({ status: 'pending', outbox: true })

    const res = await deleteOrder(orderId)

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'order_must_be_cancelled' })
    expect(await outboxCount(orderId)).toBe(1)
  })
})
