import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

// Real SQL on an in-memory PostgreSQL bound to loopback: the only database this file can reach.
vi.mock('server-only', () => ({}))

let pg: PGlite
let socket: PGLiteSocketServer
let db: typeof import('@/lib/prisma').prisma
let repair: typeof import('@/lib/test-bonus-link-repair')
let audit: typeof import('@/lib/server-audit')

const [FIRST, SECOND] = ['cmsofak7f0000cgw43x9miw66', 'cmsofaz2y0001cgw42rmhzzvs']
const testTime = new Date('2026-08-11T08:53:10Z')
const realTime = new Date('2026-08-11T10:44:59Z')

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as { port: number }
    probe.close(() => resolve(port))
  })
})

const order = (id: string, userId: string) => ({
  id, createdAt: realTime, userId, email: `${userId}@example.test`, items: [], subtotal: 100, tax: 0, delivery: 0,
  discount: 0, total: 100, firstName: 'Real', lastName: 'Customer', phone: '1', address: 'x', city: 'y',
  deliveryMethod: 'pickup', paymentMethod: 'bank',
})
const bonus = (id: string, userId: string, orderId: string | null, createdAt: Date) => ({
  id, userId, orderId, type: 'order_earn', points: 20, balanceAfter: 20, remainingPoints: 0, reason: `Order ${orderId}`, createdAt,
})

const review = () => db.$transaction(async (tx) => {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
  const state = await repair.collectBonusLinkState(tx)
  return repair.planBonusLinkRepair(state.rows, state.allStale)
})
const apply = (confirmFingerprint: string) => db.$transaction(async (tx) => {
  const operator = { id: 'u-op', email: 'op@example.test', name: 'Op', platformRole: 'admin' } as never
  return repair.applyBonusLinkRepair(tx, { confirmFingerprint, operator, reason: 'clear stale test links' })
})
const bonusRows = () => db.bonusTransaction.findMany({ orderBy: { id: 'asc' } })

beforeAll(async () => {
  const port = await freePort()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  process.env.DATABASE_URL = url
  const schemaDir = mkdtempSync(path.join(tmpdir(), 'test-bonus-link-repair-'))
  const schemaFile = path.join(schemaDir, 'schema.sql')
  execFileSync(process.execPath, [
    path.join('node_modules', 'prisma', 'build', 'index.js'),
    'migrate', 'diff', '--from-empty', '--to-schema', path.join('prisma', 'schema.prisma'), '--script', '--output', schemaFile,
  ], { stdio: 'ignore', env: { ...process.env, DATABASE_URL: url } })
  const schemaSql = readFileSync(schemaFile, 'utf8')
  rmSync(schemaDir, { recursive: true, force: true })

  pg = new PGlite()
  await pg.exec(schemaSql)
  socket = new PGLiteSocketServer({ db: pg, host: '127.0.0.1', port, maxConnections: 20 })
  await socket.start()
  db = (await import('@/lib/prisma')).prisma
  repair = await import('@/lib/test-bonus-link-repair')
  audit = await import('@/lib/server-audit')

  await db.user.createMany({ data: [
    { id: 'u_e2e_customer_fixture', email: 'e2e-customer@hairshoppro.lv.local', passwordHash: 'x', bonusPoints: 40 },
    { id: 'u-real-a', email: 'a@example.test', passwordHash: 'x', bonusPoints: 20 },
    { id: 'u-real-b', email: 'b@example.test', passwordHash: 'x', bonusPoints: 20 },
    { id: 'u-other', email: 'other@example.test', passwordHash: 'x' },
  ] })
  await db.order.createMany({ data: [order('1019', 'u-real-a'), order('1020', 'u-real-b')] })
  await db.bonusTransaction.createMany({ data: [
    bonus(FIRST, 'u_e2e_customer_fixture', '1019', testTime),
    bonus(SECOND, 'u_e2e_customer_fixture', '1020', testTime),
    // The real customers' own rows for the same order ids: correct, never touched.
    bonus('real-a', 'u-real-a', '1019', realTime),
    bonus('real-b', 'u-real-b', '1020', realTime),
    // Some other stale row: reported, never touched by this run.
    bonus('other-stale', 'u-other', '9999', testTime),
  ] })
})

afterAll(async () => {
  await db?.$disconnect()
  await socket?.stop()
  await pg?.close()
})

describe('test bonus order-link repair', () => {
  it('plans to clear only the two reviewed rows and reports other stale rows', async () => {
    const plan = await review()
    expect(plan.decisions.map((d) => [d.id, d.outcome])).toEqual([[FIRST, 'clear'], [SECOND, 'clear']])
    expect(plan.otherStaleRows).toEqual(['other-stale user=u-other order=9999'])
    expect(plan).toMatchObject({ refused: false, changes: 2 })
  })

  it('changes nothing with a wrong fingerprint', async () => {
    const before = await bonusRows()
    await expect(apply('0000000000000000')).rejects.toThrow(/state changed since review/)
    expect(await bonusRows()).toEqual(before)
  })

  it('clears only the order link of the reviewed rows', async () => {
    const before = await bonusRows()
    const orders = await db.order.findMany({ orderBy: { id: 'asc' } })
    const users = await db.user.findMany({ orderBy: { id: 'asc' } })
    const auditBefore = await db.auditLog.count()

    const { cleared } = await apply((await review()).fingerprint)
    expect(cleared).toEqual([FIRST, SECOND])

    const after = await bonusRows()
    for (const row of after) {
      const old = before.find((candidate) => candidate.id === row.id)!
      expect(row).toEqual([FIRST, SECOND].includes(row.id) ? { ...old, orderId: null } : old)
    }
    expect(await db.order.findMany({ orderBy: { id: 'asc' } })).toEqual(orders)
    expect(await db.user.findMany({ orderBy: { id: 'asc' } })).toEqual(users)

    const history = await db.auditLog.findMany({ orderBy: { sequence: 'asc' } })
    expect(history.length).toBe(auditBefore + 2)
    expect(history.slice(-2).map((row) => [row.action, row.entityId, row.actorUserId])).toEqual([
      ['bonus.test_order_link_cleared', FIRST, 'u-op'],
      ['bonus.test_order_link_cleared', SECOND, 'u-op'],
    ])
    expect(audit.verifyAuditIntegrity(history).valid).toBe(true)
  })

  it('is idempotent', async () => {
    const plan = await review()
    expect(plan.decisions.map((d) => d.outcome)).toEqual(['noop', 'noop'])
    expect(plan.changes).toBe(0)
    const auditRows = await db.auditLog.count()
    await apply(plan.fingerprint)
    expect(await db.auditLog.count()).toBe(auditRows)
  })

  it('refuses when a reviewed row now links somewhere unexpected', async () => {
    await db.bonusTransaction.update({ where: { id: FIRST }, data: { orderId: '1050' } })
    const plan = await review()
    expect(plan.refused).toBe(true)
    await expect(apply(plan.fingerprint)).rejects.toThrow(/refused/)
    expect((await db.bonusTransaction.findUniqueOrThrow({ where: { id: FIRST } })).orderId).toBe('1050')
  })
})
