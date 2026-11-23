import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { NextRequest } from 'next/server'
import { assertNotProductionDatabaseUrl } from '../../scripts/e2e-database-guard'

vi.mock('server-only', () => ({}))
const { currentUser } = vi.hoisted(() => ({ currentUser: { id: '' } }))
vi.mock('@/lib/server-auth', () => ({
  requireAdminPermission: vi.fn(async () => ({ id: 'admin-it', email: 'admin@example.invalid', platformRole: 'admin' })),
  getServerUser: vi.fn(async () => ({ id: currentUser.id })),
}))

// Real SQL on an isolated database: imported nopCommerce history is hidden from the admin order
// list and sales figures, stays in the customer's "My orders" and in the admin customer profile.
const enabled = process.env.ALLOW_ORDER_ORIGIN_DB_TESTS === 'isolated-postgres'
const suite = enabled ? describe : describe.skip

suite('admin order list without imported nopCommerce history (isolated Postgres)', () => {
  const run = randomUUID().slice(0, 8)
  const userId = `origin-it-user-${run}`
  const email = (n: string) => `origin-it-${run}-${n}@example.invalid`
  const day = 24 * 60 * 60 * 1000
  const legacy = [
    { id: randomUUID().toUpperCase(), paymentMethod: 'Payments.PaySera', createdAt: new Date('2025-05-01T10:00:00Z'), total: 40, status: 'delivered' },
    { id: randomUUID().toUpperCase(), paymentMethod: 'DevPartner.Payments.PaySera', createdAt: new Date(Date.now() - 2 * day), total: 70, status: 'shipped', promoCode: 'LEGACY' },
    { id: randomUUID().toUpperCase(), paymentMethod: 'unknown', createdAt: new Date(Date.now() - day), total: 15, status: null },
  ]
  const fresh = [
    { id: `origin-it-${run}-1`, paymentMethod: 'bank', paymentProvider: 'manual', createdAt: new Date(Date.now() - day), total: 24.95, status: 'shipped', promoCode: 'NEWCODE', userId },
    // An order placed after the existing ones appears without any further change.
    { id: `origin-it-${run}-2`, paymentMethod: 'paysera', paymentProvider: 'paysera', createdAt: new Date(), total: 10, status: null, userId },
    // Fail-open: a provider-less order with a new-shop payment method is still listed.
    { id: `origin-it-${run}-3`, paymentMethod: 'bank', paymentProvider: null, createdAt: new Date(Date.now() - day - 60 * 60 * 1000), total: 5, status: null, userId: null },
  ]
  const allIds = [...legacy, ...fresh].map((o) => o.id)

  let prisma: typeof import('@/lib/prisma')['prisma']
  let listGET: typeof import('@/app/api/admin/orders/route')['GET']
  let statsGET: typeof import('@/app/api/admin/orders/stats/route')['GET']
  let salesGET: typeof import('@/app/api/admin/sales/analytics/route')['GET']
  let breakdownGET: typeof import('@/app/api/admin/sales/breakdown/route')['GET']
  let marketingGET: typeof import('@/app/api/admin/marketing/analytics/route')['GET']
  let myGET: typeof import('@/app/api/orders/my/route')['GET']
  const before: Record<string, number> = {}

  const json = async (handler: (req: NextRequest) => Promise<Response>, url: string) => {
    const res = await handler(new NextRequest(`http://localhost${url}`))
    expect(res.status).toBe(200)
    return res.json()
  }
  const figures = async () => ({
    statsTotal: (await json(statsGET, '/api/admin/orders/stats')).totalOrderCount as number,
    statsRevenue: (await json(statsGET, '/api/admin/orders/stats')).revenue as number,
    sales30: (await json(salesGET, '/api/admin/sales/analytics?period=30d')).orderCount as number,
    salesAll: (await json(salesGET, '/api/admin/sales/analytics?period=all')).orderCount as number,
    breakdownAll: (await json(breakdownGET, '/api/admin/sales/breakdown?period=all')).orderCount as number,
  })

  beforeAll(async () => {
    assertNotProductionDatabaseUrl(process.env.DATABASE_URL, 'order origin integration tests')
    ;({ prisma } = await import('@/lib/prisma'))
    ;({ GET: listGET } = await import('@/app/api/admin/orders/route'))
    ;({ GET: statsGET } = await import('@/app/api/admin/orders/stats/route'))
    ;({ GET: salesGET } = await import('@/app/api/admin/sales/analytics/route'))
    ;({ GET: breakdownGET } = await import('@/app/api/admin/sales/breakdown/route'))
    ;({ GET: marketingGET } = await import('@/app/api/admin/marketing/analytics/route'))
    ;({ GET: myGET } = await import('@/app/api/orders/my/route'))
    Object.assign(before, await figures())

    await prisma.user.create({ data: { id: userId, email: email('user'), passwordHash: 'x', updatedAt: new Date() } })
    const base = { items: [], subtotal: 1, tax: 0, delivery: 0, deliveryMethod: 'pickup', discount: 0, firstName: 'Synthetic', lastName: 'Origin', phone: '000', address: 'Synthetic', city: 'Synthetic' }
    for (const [index, order] of legacy.entries()) {
      await prisma.order.create({ data: { ...base, id: order.id, createdAt: order.createdAt, paymentMethod: order.paymentMethod, total: order.total, promoCode: order.promoCode ?? null, email: email(`legacy${index}`), userId, paymentStatus: 'paid' } })
    }
    for (const [index, order] of fresh.entries()) {
      await prisma.order.create({ data: { ...base, id: order.id, createdAt: order.createdAt, paymentMethod: order.paymentMethod, paymentProvider: order.paymentProvider, total: order.total, promoCode: order.promoCode ?? null, email: email(`new${index}`), userId: order.userId } })
    }
    for (const order of [...legacy, ...fresh]) {
      if (order.status) await prisma.orderStatusRecord.create({ data: { orderId: order.id, status: order.status } })
    }
  })

  afterAll(async () => {
    if (!prisma) return
    await prisma.orderStatusRecord.deleteMany({ where: { orderId: { in: allIds } } })
    await prisma.order.deleteMany({ where: { id: { in: allIds } } })
    await prisma.user.deleteMany({ where: { id: userId } })
    await prisma.$disconnect()
  })

  it('lists only new-shop orders, newest first, with a matching count', async () => {
    const body = await json(listGET, `/api/admin/orders?search=${run}&take=50`)
    expect(body.orders.map((o: { id: string }) => o.id)).toEqual([fresh[1].id, fresh[0].id, fresh[2].id])
    expect(body.total).toBe(3)
  })

  it('paginates and filters by status within new-shop orders only', async () => {
    const page = await json(listGET, `/api/admin/orders?search=${run}&take=1&skip=1`)
    expect(page.orders).toHaveLength(1)
    expect(page.total).toBe(3)
    const shipped = await json(listGET, `/api/admin/orders?search=${run}&status=shipped`)
    expect(shipped.orders.map((o: { id: string }) => o.id)).toEqual([fresh[0].id])
    expect(shipped.total).toBe(1)
    const paid = await json(listGET, `/api/admin/orders?search=${run}&payment=paid`)
    expect(paid.total).toBe(0)
  })

  it('does not find an imported order even by its id or e-mail', async () => {
    const byId = await json(listGET, `/api/admin/orders?search=${legacy[1].id}`)
    expect(byId.total).toBe(0)
    const byEmail = await json(listGET, `/api/admin/orders?search=${encodeURIComponent(email('legacy0'))}`)
    expect(byEmail.total).toBe(0)
  })

  it('keeps the full purchase history for the admin customer profile (history=all)', async () => {
    const body = await json(listGET, `/api/admin/orders?search=${run}&take=200&history=all`)
    expect(body.total).toBe(6)
    expect(new Set(body.orders.map((o: { id: string }) => o.id))).toEqual(new Set(allIds))
  })

  it('counts only new-shop orders in the dashboard and sales figures', async () => {
    const after = await figures()
    expect(after.statsTotal - before.statsTotal).toBe(3)
    expect(after.statsRevenue - before.statsRevenue).toBeCloseTo(24.95 + 10 + 5, 2)
    expect(after.sales30 - before.sales30).toBe(3)
    expect(after.salesAll - before.salesAll).toBe(3)
    expect(after.breakdownAll - before.breakdownAll).toBe(3)
    const marketing = await json(marketingGET, '/api/admin/marketing/analytics?period=all')
    const codes = marketing.codeStats.map((c: { code: string }) => c.code)
    expect(codes).toContain('NEWCODE')
    expect(codes).not.toContain('LEGACY')
  })

  it("leaves imported orders in the customer's own order history", async () => {
    currentUser.id = userId
    const body = await json(myGET, '/api/orders/my?take=100')
    const ids = new Set(body.orders.map((o: { id: string }) => o.id))
    for (const order of legacy) expect(ids.has(order.id)).toBe(true)
    expect(ids.has(fresh[0].id)).toBe(true)
    expect(ids.has(fresh[1].id)).toBe(true)
  })
})
