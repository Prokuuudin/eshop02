import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

// Real route handlers and real SQL on an in-memory PostgreSQL bound to loopback. An account holds the
// victim's address and tries to read, return or erase the victim's data. New changes need a confirmed
// link, but addresses set before that remain, so the address is written directly here. Ownership must
// follow userId, never the e-mail.
const { jar } = vi.hoisted(() => ({ jar: { session: undefined as string | undefined } }))

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ unstable_cache: <T,>(fn: T) => fn, revalidateTag: () => undefined, revalidatePath: () => undefined }))
vi.mock('@/lib/mailer', () => ({ sendEmail: async () => undefined }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'eshop_session' && jar.session ? { value: jar.session } : undefined) }),
}))

const ORIGIN = 'http://localhost'
const VICTIM_EMAIL = 'victim.real@example.test'

let pg: PGlite
let socket: PGLiteSocketServer
let db: typeof import('@/lib/prisma').prisma
let hash: string
let serial = 300_000

let myOrders: typeof import('@/app/api/orders/my/route').GET
let orderById: typeof import('@/app/api/orders/[id]/route').GET
let repeatOrder: typeof import('@/app/api/orders/[id]/repeat/route').POST
let payOrder: typeof import('@/app/api/orders/[id]/pay/route').POST
let returnsRoute: typeof import('@/app/api/returns/route')
let returnById: typeof import('@/app/api/returns/[id]/route')
let deleteUser: typeof import('@/app/api/user/route').DELETE
let userExport: typeof import('@/app/api/user/export/route').GET
let exportUserData: typeof import('@/lib/user-erasure').exportUserData
let createSession: typeof import('@/lib/server-auth').createSession

const freePort = (): Promise<number> => new Promise((resolve) => {
  const probe = createServer()
  probe.listen(0, '127.0.0.1', () => { const p = (probe.address() as { port: number }).port; probe.close(() => resolve(p)) })
})
const request = (url: string, method = 'GET', body?: unknown): NextRequest => new NextRequest(`${ORIGIN}${url}`, {
  method,
  headers: { 'content-type': 'application/json', origin: ORIGIN, ...(jar.session ? { cookie: `eshop_session=${jar.session}` } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
})
const params = <T extends string>(id: T) => ({ params: Promise.resolve({ id }) })

const account = async (email?: string, platformRole = 'customer') => {
  serial += 1
  return db.user.create({
    data: { id: `user-${serial}`, email: email ?? `user-${serial}@example.test`, passwordHash: hash, name: `Name ${serial}`, phone: '+37120000000', cardNumber: String(serial), platformRole },
  })
}
const order = async (userId: string | null, email: string, firstName = 'Owner') => {
  serial += 1
  const id = String(serial)
  await db.order.create({
    data: {
      id, createdAt: new Date(), userId, email, firstName, lastName: 'Person', phone: '+37129999999', address: 'Secret street 1', city: 'Riga',
      items: [{ id: 'p1', title: 'Shampoo', price: 10, quantity: 3 }], subtotal: 30, tax: 0, delivery: 0, discount: 0, total: 30,
      deliveryMethod: 'pickup', paymentMethod: 'bank', paymentStatus: 'paid', paymentProvider: 'manual',
      legalDetails: { customerType: 'individual', invoicePersonalCode: '010101-11111' },
    },
  })
  return id
}
const returnOf = async (orderId: string, email: string) => {
  serial += 1
  const id = `ret-${serial}`
  await db.returnRequest.create({
    data: { id, orderId, reason: 'defective', items: [{ productId: 'p1', quantity: 1 }], refundAmount: 10, firstName: 'Owner', lastName: 'Person', email, phone: '+37129999999', status: 'pending' },
  })
  return id
}
const signIn = async (userId: string): Promise<void> => { jar.session = await createSession(userId) }
const setEmail = (userId: string, email: string) => db.user.update({ where: { id: userId }, data: { email } })
const orderIdsFrom = async (res: Response) => ((await res.json()) as { orders: Array<{ id: string }> }).orders.map((o) => o.id)

/** A victim with a real order and return, plus an attacker who took the victim's address. */
async function attackScene() {
  const victim = await account(`card.${serial}@client.local`)
  const victimOrder = await order(victim.id, VICTIM_EMAIL, 'Victim')
  const victimReturn = await returnOf(victimOrder, VICTIM_EMAIL)
  const legacyOrder = await order(null, VICTIM_EMAIL, 'Legacy')
  await db.savedAddress.create({ data: { id: `addr-${serial}`, userId: victim.id, email: `other-${serial}@example.test`, firstName: 'Victim', lastName: 'Person', phone: '+371', address: 'Secret street 1', city: 'Riga' } })
  const attacker = await account()
  const attackerOrder = await order(attacker.id, attacker.email, 'Attacker')
  await signIn(attacker.id)
  await setEmail(attacker.id, VICTIM_EMAIL)
  return { victim, victimOrder, victimReturn, legacyOrder, attacker, attackerOrder }
}

beforeAll(async () => {
  const port = await freePort()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  process.env.DATABASE_URL = url
  const dir = mkdtempSync(path.join(tmpdir(), 'order-ownership-'))
  const file = path.join(dir, 'schema.sql')
  execFileSync(process.execPath, [path.join('node_modules', 'prisma', 'build', 'index.js'), 'migrate', 'diff', '--from-empty', '--to-schema', path.join('prisma', 'schema.prisma'), '--script', '--output', file], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } })
  pg = new PGlite()
  await pg.exec(readFileSync(file, 'utf8'))
  rmSync(dir, { recursive: true, force: true })
  socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port, maxConnections: 20 })
  await socket.start()

  db = (await import('@/lib/prisma')).prisma
  myOrders = (await import('@/app/api/orders/my/route')).GET
  orderById = (await import('@/app/api/orders/[id]/route')).GET
  repeatOrder = (await import('@/app/api/orders/[id]/repeat/route')).POST
  payOrder = (await import('@/app/api/orders/[id]/pay/route')).POST
  returnsRoute = await import('@/app/api/returns/route')
  returnById = await import('@/app/api/returns/[id]/route')
  deleteUser = (await import('@/app/api/user/route')).DELETE
  userExport = (await import('@/app/api/user/export/route')).GET
  exportUserData = (await import('@/lib/user-erasure')).exportUserData
  createSession = (await import('@/lib/server-auth')).createSession
  hash = await bcrypt.hash('password-for-tests', 4)
}, 120_000)

afterAll(async () => { await db?.$disconnect(); await socket?.stop(); await pg?.close() })
beforeEach(async () => {
  jar.session = undefined
  await db.returnRequest.deleteMany({})
  await db.bonusTransaction.deleteMany({})
  await db.order.deleteMany({})
  await db.savedAddress.deleteMany({})
  await db.accessRequest.deleteMany({})
  await db.session.deleteMany({})
  await db.user.deleteMany({})
})

describe('an account holding the victim address', () => {
  it('sees only their own orders in /api/orders/my', async () => {
    const { attackerOrder } = await attackScene()
    expect(await orderIdsFrom(await myOrders(request('/api/orders/my')))).toEqual([attackerOrder])
  })

  it('cannot open, repeat or pay a victim order or an ownerless order', async () => {
    const { victimOrder, legacyOrder } = await attackScene()
    for (const id of [victimOrder, legacyOrder]) {
      expect((await orderById(request(`/api/orders/${id}`), params(id))).status).toBe(404)
      expect((await repeatOrder(request(`/api/orders/${id}/repeat`, 'POST'), params(id))).status).toBe(404)
      expect((await payOrder(request(`/api/orders/${id}/pay`, 'POST'), params(id))).status).toBe(404)
    }
  })

  it('cannot create a return on them', async () => {
    const { victimOrder, legacyOrder } = await attackScene()
    for (const orderId of [victimOrder, legacyOrder]) {
      const res = await returnsRoute.POST(request('/api/returns', 'POST', { orderId, reason: 'defective', items: [{ productId: 'p1', quantity: 1 }] }))
      expect(res.status).toBe(403)
    }
    expect(await db.returnRequest.count({ where: { orderId: legacyOrder } })).toBe(0)
  })

  it('cannot list, read or change the victim return', async () => {
    const { victimReturn } = await attackScene()

    const list = await returnsRoute.GET(request('/api/returns'))
    expect(((await list.json()) as { returns: unknown[] }).returns).toHaveLength(0)
    expect((await returnById.GET(request(`/api/returns/${victimReturn}`), params(victimReturn))).status).toBe(403)
    expect((await returnById.PATCH(request(`/api/returns/${victimReturn}`, 'PATCH', { comment: 'x' }), params(victimReturn))).status).toBe(403)
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: victimReturn } })).comment).toBeNull()
  })

  it('gets no victim data in the GDPR export, including an access request with that address', async () => {
    const { attacker, attackerOrder, victimOrder } = await attackScene()
    await db.accessRequest.create({ data: { id: `ar-${serial}`, email: VICTIM_EMAIL, passwordHash: hash, name: 'Victim', phone: '+371', companyId: '', companyName: '', cardNumber: '', status: 'pending' } })

    const data = await exportUserData({ id: attacker.id, email: VICTIM_EMAIL })

    expect((data.orders as Array<{ id: string }>).map((o) => o.id)).toEqual([attackerOrder])
    expect(JSON.stringify(data)).not.toContain(victimOrder)
        expect(data.returnRequests).toHaveLength(0)
    expect(data.accessRequests).toHaveLength(0)
    expect((await userExport()).status).toBe(200)
  })

  it('cannot erase anything of the victim by deleting their own account', async () => {
    const { victim, victimOrder, victimReturn, legacyOrder, attacker, attackerOrder } = await attackScene()
    const attackerReturn = await returnOf(attackerOrder, attacker.email)
    await db.savedAddress.create({ data: { id: `addr-a-${serial}`, userId: attacker.id, email: VICTIM_EMAIL, firstName: 'A', lastName: 'B', phone: '+371', address: 'A street', city: 'Riga' } })
    await db.savedAddress.create({ data: { id: `addr-l-${serial}`, userId: null, email: VICTIM_EMAIL, firstName: 'Legacy', lastName: 'Person', phone: '+371', address: 'Legacy street', city: 'Riga' } })
    await db.accessRequest.create({ data: { id: `ar-${serial}`, email: VICTIM_EMAIL, passwordHash: hash, name: 'Victim', phone: '+371', companyId: '', companyName: '', cardNumber: '', status: 'pending' } })

    const res = await deleteUser(request('/api/user', 'DELETE'))
    expect(res.status).toBe(200)

    for (const [id, name] of [[victimOrder, 'Victim'], [legacyOrder, 'Legacy']]) {
      const kept = await db.order.findUniqueOrThrow({ where: { id } })
      expect(kept).toMatchObject({ firstName: name, lastName: 'Person', email: VICTIM_EMAIL, phone: '+37129999999', address: 'Secret street 1', city: 'Riga' })
    }
    expect((await db.order.findUniqueOrThrow({ where: { id: legacyOrder } })).userId).toBeNull()
    expect((await db.order.findUniqueOrThrow({ where: { id: victimOrder } })).userId).toBe(victim.id)
    expect(await db.returnRequest.findUniqueOrThrow({ where: { id: victimReturn } })).toMatchObject({ email: VICTIM_EMAIL, firstName: 'Owner', phone: '+37129999999' })
    expect(await db.savedAddress.count({ where: { userId: victim.id } })).toBe(1)
    expect(await db.savedAddress.count({ where: { userId: null, email: VICTIM_EMAIL } })).toBe(1)
    expect(await db.accessRequest.count({ where: { email: VICTIM_EMAIL } })).toBe(1)
    expect((await db.user.findUniqueOrThrow({ where: { id: victim.id } })).name).not.toBeNull()

    // What the attacker really owned is erased.
    expect(await db.order.findUniqueOrThrow({ where: { id: attackerOrder } })).toMatchObject({ firstName: 'Deleted', lastName: 'User', address: '', phone: '' })
    expect(await db.returnRequest.findUniqueOrThrow({ where: { id: attackerReturn } })).toMatchObject({ firstName: 'Deleted', phone: '' })
    expect(await db.savedAddress.count({ where: { userId: attacker.id } })).toBe(0)
    expect(await db.session.count({ where: { userId: attacker.id } })).toBe(0)
  }, 30_000)
})

describe('a legitimate owner', () => {
  it('keeps access when the checkout e-mail differs from the account e-mail', async () => {
    const owner = await account(`card.${serial}@client.local`)
    const id = await order(owner.id, 'typed-at-checkout@example.test')
    await signIn(owner.id)

    expect(await orderIdsFrom(await myOrders(request('/api/orders/my')))).toEqual([id])
    expect((await orderById(request(`/api/orders/${id}`), params(id))).status).toBe(200)

    const created = await returnsRoute.POST(request('/api/returns', 'POST', { orderId: id, reason: 'defective', items: [{ productId: 'p1', quantity: 1 }] }))
    expect(created.status).toBe(201)
    const { returnId } = await created.json() as { returnId: string }
    expect((await db.returnRequest.findUniqueOrThrow({ where: { id: returnId } })).email).toBe('typed-at-checkout@example.test')
    expect((await returnById.GET(request(`/api/returns/${returnId}`), params(returnId))).status).toBe(200)
    const list = await returnsRoute.GET(request('/api/returns'))
    expect(((await list.json()) as { returns: Array<{ id: string }> }).returns.map((r) => r.id)).toEqual([returnId])
  }, 30_000)

  it('keeps orders and returns after changing the account e-mail', async () => {
    const owner = await account()
    const id = await order(owner.id, owner.email)
    const ret = await returnOf(id, owner.email)
    await signIn(owner.id)

    await setEmail(owner.id, 'new-address@example.test')

    expect(await orderIdsFrom(await myOrders(request('/api/orders/my')))).toEqual([id])
    expect((await orderById(request(`/api/orders/${id}`), params(id))).status).toBe(200)
    expect((await returnById.GET(request(`/api/returns/${ret}`), params(ret))).status).toBe(200)
    expect((await db.order.findUniqueOrThrow({ where: { id } })).email).toBe(owner.email)
  })

  it('has every owned record erased on deletion, whatever e-mail the order carries', async () => {
    const owner = await account()
    const id = await order(owner.id, 'typed-at-checkout@example.test')
    const ret = await returnOf(id, 'typed-at-checkout@example.test')
    await signIn(owner.id)

    expect((await deleteUser(request('/api/user', 'DELETE'))).status).toBe(200)

    expect(await db.order.findUniqueOrThrow({ where: { id } })).toMatchObject({ firstName: 'Deleted', email: `anon-${owner.id}@deleted.invalid`, address: '' })
    expect(await db.returnRequest.findUniqueOrThrow({ where: { id: ret } })).toMatchObject({ firstName: 'Deleted', email: `anon-${owner.id}@deleted.invalid` })
  }, 30_000)
})

describe('historical orders without a userId', () => {
  it('are not linked to anyone by any of these flows and stay visible to staff', async () => {
    const customer = await account(VICTIM_EMAIL)
    const legacy = await order(null, VICTIM_EMAIL, 'Legacy')
    await signIn(customer.id)

    expect(await orderIdsFrom(await myOrders(request('/api/orders/my')))).toEqual([])
    expect((await orderById(request(`/api/orders/${legacy}`), params(legacy))).status).toBe(404)
    expect((await db.order.findUniqueOrThrow({ where: { id: legacy } })).userId).toBeNull()

    const admin = await account(undefined, 'admin')
    jar.session = await createSession(admin.id, { mfaVerified: true })
    expect((await orderById(request(`/api/orders/${legacy}`), params(legacy))).status).toBe(200)
    expect((await db.order.findUniqueOrThrow({ where: { id: legacy } })).userId).toBeNull()
  })

  it('still reach a staff export of a guest by e-mail', async () => {
    const legacy = await order(null, 'guest@example.test', 'Guest')
    const data = await exportUserData({ id: null, email: 'guest@example.test' })
    expect((data.orders as Array<{ id: string }>).map((o) => o.id)).toEqual([legacy])
  })
})
