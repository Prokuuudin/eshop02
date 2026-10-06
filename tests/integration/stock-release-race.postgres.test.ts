import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createHmac, randomBytes, randomUUID } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import type { ServerUser } from '@/lib/server-auth'
import type { ServerOrder, ServerOrderItem } from '@/lib/orders-data-types'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: async () => actor,
  requireAdminPermission: async () => actor,
}))
vi.mock('@/lib/mailer', () => ({ sendEmail: async () => { throw new Error('Mail is outside the stock test scope') } }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ limited: false, remaining: 1, resetAt: Date.now() + 1000 }) }))
vi.mock('@/lib/paysera', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/paysera')>()
  return { ...original, createPayseraPaymentForOrder: async (order: ServerOrder) => {
    const { createOrderPaymentSession } = await import('@/lib/orders-data-store')
    return createOrderPaymentSession(order.id, async () => ({ payseraOrderId: randomUUID(), paymentUrl: 'https://example.test/payment' }))
  } }
})

import { prisma } from '@/lib/prisma'
import { createServerOrder, getServerOrderById, updateServerOrderByAdmin, releaseExpiredStockReservations, createOrderPaymentSession } from '@/lib/orders-data-store'
import { POST as callback } from '@/app/api/webhooks/paysera/route'
import { POST as cancel } from '@/app/api/admin/order-meta/route'
import { POST as bulkCancel } from '@/app/api/admin/order-meta/bulk/route'
import { POST as retry } from '@/app/api/orders/[id]/pay/route'

const actor: ServerUser = {
  id: 'stock-test-actor', email: 'stock-test@example.test', platformRole: 'admin',
  approvalRequired: false, auditLoggingEnabled: false, bonusPoints: 0,
  mustChangePassword: false, createdAt: new Date().toISOString(),
}
const evidence: Array<Record<string, unknown>> = []
const iterations = 30
const request = (body: unknown) => new NextRequest('https://example.test/api/admin/order-meta', { method: 'POST', body: JSON.stringify(body) })
const line = (id: string, quantity: number): ServerOrderItem => ({ id, quantity, price: 10, stock: 0, title: id, brand: 'Test', image: '', category: 'hair', rating: 0 })

async function fixture(stock = 3, secondSku = false): Promise<void> {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "Order", "OrderStatusRecord", "OrderNote", "Product", "AuditLog" CASCADE')
  for (const id of secondSku ? ['p1', 'p2'] : ['p1']) {
    await prisma.product.create({ data: { id, title: id, brand: 'Test', category: 'hair', price: 10, stock,
      images: [], badges: [], relatedProductIds: [], oftenBoughtTogether: [], certificates: [], compatibleEquipment: [] } })
  }
}
async function reserve(qty = 2, expired = true, ids = ['p1']): Promise<ServerOrder> {
  const subtotal = qty * ids.length * 10
  return createServerOrder({ createdAt: new Date().toISOString(), items: ids.map(id => line(id, qty)), subtotal, tax: 0,
    delivery: 0, discount: 0, total: subtotal, deliveryMethod: 'pickup', pickupStoreId: 'imanta', country: 'LV',
    firstName: 'Stock', lastName: 'Verification', email: actor.email, phone: '', address: '', city: '',
    paymentMethod: 'paysera', paymentProvider: 'paysera', paymentSessionId: randomUUID(), paymentStatus: 'unpaid',
    stockReservationStatus: 'reserved', stockReservedUntil: new Date(Date.now() + (expired ? -1000 : 60_000)).toISOString() })
}
const edit = (order: ServerOrder, qty: number) => updateServerOrderByAdmin(order.id, {
  items: order.items.map(item => ({ id: item.id, quantity: qty })), deliveryMethod: 'pickup', pickupStoreId: 'imanta', country: 'LV', address: '', city: '',
}, actor, request({}))
async function signed(order: ServerOrder, status = 'paid'): Promise<Response> {
  const amount = Math.round(order.total * 100)
  const body = JSON.stringify({ event: { type: 'order', name: 'amount_paid_updated' }, order: {
    merchant_order_id: order.id, paysera_order_id: order.paymentSessionId, amount, amount_paid: amount, currency: 'EUR', status,
  } })
  const signature = createHmac('sha256', process.env.PAYSERA_CLIENT_SECRET!).update(body).digest('hex')
  return callback(new NextRequest('https://example.test/api/webhooks/paysera', { method: 'POST', body, headers: { 'x-paysera-signature': signature } }))
}

type Balance = { available: number; reserved: number; committed: number; released: number; quantities: Array<{ id: string; state: string; quantity: number; paid: boolean }> }
async function conservation(physical: number): Promise<Balance> {
  const balance = await prisma.$transaction(async tx => {
    const products = await tx.product.findMany({ select: { stock: true } })
    const orders = await tx.order.findMany({ select: { id: true, items: true, stockReservationStatus: true, paymentStatus: true } })
    const result: Balance = { available: products.reduce((sum, row) => sum + row.stock, 0), reserved: 0, committed: 0, released: 0, quantities: [] }
    for (const order of orders) {
      const quantity = (order.items as ServerOrderItem[]).reduce((sum, item) => sum + item.quantity, 0)
      const state = order.stockReservationStatus
      if (state === 'reserved' || state === 'committed' || state === 'released') result[state] += quantity
      if (order.paymentStatus === 'paid') expect(state).toBe('committed')
      result.quantities.push({ id: order.id, state, quantity, paid: order.paymentStatus === 'paid' })
    }
    return result
  }, { isolationLevel: 'RepeatableRead' })
  expect(balance.available).toBeGreaterThanOrEqual(0)
  // Released quantity is already returned into available and is not counted twice.
  expect(balance.available + balance.reserved + balance.committed).toBe(physical)
  return balance
}
function gate(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}
async function waitForLock(table: string): Promise<string> {
  const deadline = Date.now() + 2500
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRaw<Array<{ query: string }>>`SELECT query FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()`
    const row = rows.find(row => row.query.includes(`"${table}"`) && (row.query.includes('UPDATE') || row.query.includes('FOR UPDATE')))
    if (row) return row.query
    await new Promise(done => setTimeout(done, 5))
  }
  throw new Error(`No real ${table} lock wait observed`)
}
async function editVersusCleanup(order: ServerOrder, qty: number): Promise<void> {
  const acquired = gate(), unblock = gate()
  const blocker = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = 'p1' FOR UPDATE`
    acquired.resolve(); await unblock.promise
  }, { timeout: 20_000 })
  await acquired.promise
  const editing = edit(order, qty)
  let cleaning: Promise<number> | undefined
  try {
    await waitForLock('Product')
    cleaning = releaseExpiredStockReservations()
    await waitForLock('Order')
  } finally { unblock.resolve() }
  await Promise.all([blocker, editing, cleaning])
}

async function paymentFirst(order: ServerOrder): Promise<[PromiseSettledResult<ServerOrder>, PromiseSettledResult<Response>]> {
  const acquired = gate(), unblock = gate()
  const blocker = prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`
    acquired.resolve(); await unblock.promise
  }, { timeout: 20_000 })
  await acquired.promise
  const paying = signed(order)
  let editing: Promise<ServerOrder> | undefined
  try {
    await waitForLock('Order') // The callback is first in the real row-lock queue.
    editing = edit(order, 1)
    const deadline = Date.now() + 2500
    let waits = 0
    while (Date.now() < deadline) {
      const rows = await prisma.$queryRaw<Array<{ query: string }>>`SELECT query FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND pid <> pg_backend_pid()`
      waits = rows.filter(row => row.query.includes('"Order"') && row.query.includes('FOR UPDATE')).length
      if (waits >= 2) break
      await new Promise(done => setTimeout(done, 5))
    }
    expect(waits).toBeGreaterThanOrEqual(2)
  } finally { unblock.resolve() }
  const results = await Promise.allSettled([editing!, paying])
  await blocker
  return results
}

beforeAll(async () => {
  const candidate = process.env.STOCK_TEST_DATABASE_URL
  if (!candidate || process.env.STOCK_TEST_WRITE_ACK !== 'isolated-local') throw new Error('Explicit isolated stock test target required')
  let target: URL
  try { target = new URL(candidate) } catch { throw new Error('Invalid isolated stock test target') }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)
    || !['127.0.0.1', 'localhost'].includes(target.hostname)
    || !/^\/hairshop_stock_race_[a-z0-9_]+$/.test(target.pathname)
    || process.env.DATABASE_URL !== candidate) throw new Error('Refusing stock writes outside the dedicated local test database')
  const rows = await prisma.$queryRaw<Array<{ database: string; port: number; isolation: string; version: string }>>`
    SELECT current_database() AS database, inet_server_port() AS port, current_setting('transaction_isolation') AS isolation, version()`
  expect(rows[0].database).toBe(decodeURIComponent(target.pathname.slice(1)))
  expect(rows[0].port).toBe(Number(target.port || 5432))
  expect(rows[0].isolation).toBe('read committed')
  evidence.push({ postgres: rows[0], adapter: 'PrismaPg', mode: 'real PostgreSQL; synthetic signed payment events; no provider calls' })
  vi.stubEnv('PAYSERA_CLIENT_ID', randomUUID()); vi.stubEnv('PAYSERA_PROJECT_ID', randomUUID())
  vi.stubEnv('PAYSERA_CLIENT_SECRET', randomBytes(32).toString('hex'))
})
afterAll(async () => {
  if (process.env.STOCK_TEST_EVIDENCE_PATH) writeFileSync(process.env.STOCK_TEST_EVIDENCE_PATH, JSON.stringify(evidence, null, 2))
  vi.unstubAllEnvs()
  await prisma.$disconnect()
})

describe('stock release on real PostgreSQL', () => {
  it('ownership reconciles 1 available + 2 reserved -> 2 available + 1 reserved -> 3 available', async () => {
    await fixture(3); const order = await reserve(2)
    const before = await conservation(3)
    expect(before).toMatchObject({ available: 1, reserved: 2, released: 0, committed: 0 })
    const edited = await edit(order, 1)
    expect(edited.items[0].quantity).toBe(1)
    const afterEdit = await conservation(3)
    expect(afterEdit).toMatchObject({ available: 2, reserved: 1, released: 0, committed: 0 })
    expect(await releaseExpiredStockReservations()).toBe(1)
    const afterRelease = await conservation(3)
    expect(afterRelease).toMatchObject({ available: 3, reserved: 0, released: 1, committed: 0 })
    evidence.push({ check: 'explicit stock ownership', before, afterEdit, afterRelease })
  })
  it('B: original qty 2 -> 1 race never creates a fourth unit (100 real lock interleavings)', async () => {
    let first: Balance | undefined
    for (let i = 0; i < 100; i++) {
      await fixture(3); const order = await reserve(2)
      expect(await conservation(3)).toMatchObject({ available: 1, reserved: 2, committed: 0, released: 0 })
      await editVersusCleanup(order, 1)
      const balance = await conservation(3)
      expect(balance).toMatchObject({ available: 3, reserved: 0, committed: 0, released: 1 })
      expect(balance.quantities[0].quantity).toBe(1); first ??= balance
      await expect(reserve(4, false)).rejects.toMatchObject({ name: 'InsufficientStockError' })
      await conservation(3)
    }
    // The entire real quantity is payable, with no artificial available stock.
    const legitimate = await reserve(3, false)
    expect((await signed(legitimate)).status).toBe(200)
    expect(await conservation(3)).toMatchObject({ available: 0, reserved: 0, committed: 3 })
    evidence.push({ scenario: 'B/original decrease', iterations: 100, finalAvailable: 3, phantomStockIterations: 0, first,
      rejectedQty4: true, finalLegitimatePaidQty: 3 })
  })
  it('A: concurrent reserve and cleanup conserve stock regardless of candidate visibility', async () => {
    for (let i = 0; i < iterations; i++) {
      await fixture(); await Promise.all([reserve(2), releaseExpiredStockReservations()])
      await conservation(3); await releaseExpiredStockReservations()
      expect(await conservation(3)).toMatchObject({ available: 3, reserved: 0 })
    }
    evidence.push({ scenario: 'A/reserve + cleanup', iterations, conserved: true })
  })
  it('C: current increased quantity is returned exactly once', async () => {
    for (let i = 0; i < iterations; i++) {
      await fixture(4); const order = await reserve(1)
      await editVersusCleanup(order, 3)
      expect(await conservation(4)).toMatchObject({ available: 4, reserved: 0, released: 3 })
    }
    evidence.push({ scenario: 'C/increase + cleanup', iterations, conserved: true })
  })
  it('D: expired callback and concurrent cleaners cannot produce paid/released or duplicate stock', async () => {
    for (let i = 0; i < iterations; i++) {
      await fixture(); const order = await reserve()
      const [response] = await Promise.all([signed(order), releaseExpiredStockReservations(), releaseExpiredStockReservations()])
      expect(response.status).toBe(500)
      expect(await conservation(3)).toMatchObject({ available: 3, committed: 0, reserved: 0 })
    }
    evidence.push({ scenario: 'D/cleanup + expired callback', iterations, conserved: true })
  })
  it('E: edit and current callback serialize; an edited order needs a new current session', async () => {
    let paymentWins = 0, editWins = 0
    for (let i = 0; i < iterations; i++) {
      await fixture(); const order = await reserve(2, false)
      const [editing, payment] = i % 2 === 0
        ? await Promise.allSettled([edit(order, 1), signed(order)])
        : await paymentFirst(order)
      if (editing.status === 'fulfilled') {
        editWins++; expect(payment.status).toBe('fulfilled')
        if (payment.status === 'fulfilled') expect(payment.value.status).toBe(500)
        const created = await createOrderPaymentSession(order.id, async () => ({ payseraOrderId: randomUUID(), paymentUrl: 'https://example.test/payment' }))
        expect((await signed(created.order)).status).toBe(200)
      } else {
        paymentWins++; expect(editing.reason).toMatchObject({ code: 'paid_order' })
        if (payment.status !== 'fulfilled') throw payment.reason
        expect(payment.value.status).toBe(200)
      }
      await conservation(3)
    }
    evidence.push({ scenario: 'E/edit + callback', iterations, editWins, paymentWins, conserved: true })
  })
  it('F: single cancel and cleanup return the reservation once', async () => {
    for (let i = 0; i < iterations; i++) {
      await fixture(); const order = await reserve()
      const [response] = await Promise.all([cancel(request({ orderId: order.id, status: 'cancelled' })), releaseExpiredStockReservations()])
      expect(response.status).toBe(200)
      expect(await conservation(3)).toMatchObject({ available: 3, reserved: 0, committed: 0 })
    }
    evidence.push({ scenario: 'F/cancel + cleanup', iterations, conserved: true })
  })
  it('G: concurrent duplicate cleanup restores once', async () => {
    for (let i = 0; i < iterations; i++) {
      await fixture(); await reserve()
      const counts = await Promise.all(Array.from({ length: 4 }, () => releaseExpiredStockReservations()))
      expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1)
      expect(await conservation(3)).toMatchObject({ available: 3, reserved: 0 })
    }
    evidence.push({ scenario: 'G/duplicate cleanup', iterations, cleanersPerIteration: 4, conserved: true })
  })
  it('H: concurrent callbacks and cancel-after-paid keep committed physical stock', async () => {
    for (let i = 0; i < iterations; i++) {
      await fixture(); const order = await reserve(2, false)
      const responses = await Promise.all(Array.from({ length: 4 }, () => signed(order)))
      expect(responses.every(response => response.status === 200)).toBe(true)
      expect((await signed(order, 'cancelled')).status).toBe(200)
      expect(await conservation(3)).toMatchObject({ available: 1, reserved: 0, committed: 2 })
    }
    evidence.push({ scenario: 'H/duplicate callbacks + late cancel', iterations, callbacksPerIteration: 4, conserved: true })
  })
  it('I: cleanup and expired retry never expose a new session or reserve more stock', async () => {
    for (let i = 0; i < iterations; i++) {
      await fixture(); const order = await reserve()
      const [response] = await Promise.all([retry(request({}), { params: Promise.resolve({ id: order.id }) }), releaseExpiredStockReservations()])
      expect(response.status).toBe(409)
      expect(await conservation(3)).toMatchObject({ available: 3, reserved: 0 })
    }
    evidence.push({ scenario: 'I/cleanup + retry', iterations, conserved: true })
  })
  it('last unit: two concurrent reservations cannot both become paid/committed', async () => {
    for (let i = 0; i < iterations; i++) {
      await fixture(1)
      const attempts = await Promise.allSettled([reserve(1, false), reserve(1, false)])
      expect(attempts.filter(attempt => attempt.status === 'fulfilled')).toHaveLength(1)
      const winner = attempts.find(attempt => attempt.status === 'fulfilled')
      if (winner?.status !== 'fulfilled') throw new Error('No successful reservation')
      expect((await signed(winner.value)).status).toBe(200)
      expect(await conservation(1)).toMatchObject({ available: 0, reserved: 0, committed: 1 })
    }
    evidence.push({ scenario: 'last physical unit', iterations, conserved: true })
  })
  it('reverse SKU order does not deadlock reserve/release/bulk cancel', async () => {
    for (let i = 0; i < 20; i++) {
      await fixture(2, true)
      const [a, b] = await Promise.all([reserve(1, true, ['p2', 'p1']), reserve(1, true, ['p1', 'p2'])])
      expect(await conservation(4)).toMatchObject({ available: 0, reserved: 4 })
      const [response] = await Promise.all([bulkCancel(request({ orderIds: [b.id, a.id], status: 'cancelled' })), releaseExpiredStockReservations()])
      expect(response.status).toBe(200)
      expect(await conservation(4)).toMatchObject({ available: 4, reserved: 0, committed: 0 })
    }
    evidence.push({ scenario: 'reverse SKUs / bulk cancel + cleanup', iterations: 20, conserved: true })
  })
  it('failed increase rolls back quantity/stock and cleanup releases only the original reservation', async () => {
    for (let i = 0; i < 10; i++) {
      await fixture(); const order = await reserve(1)
      await expect(edit(order, 4)).rejects.toMatchObject({ code: 'insufficient_stock' })
      expect((await getServerOrderById(order.id))?.items[0].quantity).toBe(1)
      await releaseExpiredStockReservations()
      expect(await conservation(3)).toMatchObject({ available: 3, reserved: 0, released: 1 })
    }
    evidence.push({ scenario: 'insufficient increase rollback', iterations: 10, conserved: true })
  })
})
