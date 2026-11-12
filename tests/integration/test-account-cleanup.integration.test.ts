import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import bcrypt from 'bcryptjs'
import { NextRequest } from 'next/server'
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'

// Real SQL on an in-memory PostgreSQL bound to loopback: the only database this file can reach.
vi.mock('server-only', () => ({}))

let pg: PGlite
let socket: PGLiteSocketServer
let db: typeof import('@/lib/prisma').prisma
let cleanup: typeof import('@/lib/test-account-cleanup')
let audit: typeof import('@/lib/server-audit')

const OLD_PASSWORD = 'admin123'
const CUSTOMER_BONUS = ['cmsofak7f0000cgw43x9miw66', 'cmsofaz2y0001cgw42rmhzzvs']

const freePort = (): Promise<number> => new Promise((resolve, reject) => {
  const probe = createServer()
  probe.once('error', reject)
  probe.listen(0, '127.0.0.1', () => {
    const { port } = probe.address() as { port: number }
    probe.close(() => resolve(port))
  })
})

const user = (id: string, email: string, extra: Record<string, unknown> = {}) => ({
  id, email, passwordHash: bcrypt.hashSync(OLD_PASSWORD, 4), name: null as string | null, ...extra,
})
const order = (id: string, userId: string, email: string, extra: Record<string, unknown> = {}) => ({
  id, createdAt: new Date('2026-09-24T14:24:04Z'), userId, email, items: [], subtotal: 61.9, tax: 0, delivery: 0, discount: 0, total: 61.9,
  firstName: 'A', lastName: 'B', phone: '1', address: 'x', city: 'y', deliveryMethod: 'courier', paymentMethod: 'bank', ...extra,
})
const bonus = (id: string, userId: string, orderId: string | null, points: number, balanceAfter: number, at: string) => ({
  id, userId, orderId, type: 'order_earn', points, balanceAfter, remainingPoints: 0, reason: `Order ${orderId ?? '-'}`, createdAt: new Date(at),
})

const operator = async () => cleanup.resolveCleanupOperator(db as never, 'operator@example.test')
const review = () => db.$transaction(async (tx) => {
  await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY')
  return cleanup.planTestAccountCleanup(await cleanup.collectCleanupStates(tx))
})
const apply = async (confirmFingerprint: string) => {
  const actor = await operator()
  return db.$transaction((tx) => cleanup.applyTestAccountCleanup(tx, { confirmFingerprint, operator: actor, reason: 'remove test accounts' }), { timeout: 30_000 })
}
const outcomes = (plan: { decisions: Array<{ id: string; outcome: string }> }) =>
  Object.fromEntries(plan.decisions.map((decision) => [decision.id, decision.outcome]))
const dump = async () => ({
  users: await db.user.findMany({ orderBy: { id: 'asc' } }),
  orders: await db.order.findMany({ orderBy: { id: 'asc' } }),
  bonus: await db.bonusTransaction.findMany({ orderBy: { id: 'asc' } }),
  sessions: await db.session.findMany({ orderBy: { id: 'asc' } }),
  challenges: await db.mfaChallenge.findMany({ orderBy: { id: 'asc' } }),
  wishlist: await db.wishlistItem.findMany({ orderBy: { id: 'asc' } }),
  audit: await db.auditLog.findMany({ orderBy: { sequence: 'asc' } }),
})

beforeAll(async () => {
  const port = await freePort()
  const url = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`
  process.env.DATABASE_URL = url
  const schemaDir = mkdtempSync(path.join(tmpdir(), 'test-account-cleanup-'))
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
  cleanup = await import('@/lib/test-account-cleanup')
  audit = await import('@/lib/server-audit')

  await db.user.createMany({ data: [
    user('u-operator', 'operator@example.test', { platformRole: 'admin', superAdmin: true, mfaEnabled: true, mfaSecret: 'enc' }),
    // A legitimate admin without MFA must never be touched.
    user('u-legit-admin', 'legit-admin@example.test', { platformRole: 'admin', mustChangePassword: true }),
    user('u-real-customer', 'real-customer@example.test', { cardNumber: 'C-1', bonusPoints: 5 }),
    user('seed_admin_001', 'admin@test.com', { name: 'Admin1234', bonusPoints: 33, mfaEnabled: true, mfaSecret: 'enc', mfaBackupCodes: ['a', 'b'], mfaEnrolledAt: new Date() }),
    user('u_e2e_admin_fixture', 'e2e-admin@hairshoppro.lv.local', { name: 'E2E Admin' }),
    user('u_e2e_manager_fixture', 'e2e-manager@hairshoppro.lv.local', { name: 'E2E Manager', companyId: 'company_x', companyName: 'X' }),
    user('u_e2e_customer_fixture', 'e2e-customer@hairshoppro.lv.local', { name: 'E2E Customer', bonusPoints: 40 }),
  ] })
  await db.session.create({ data: { id: 's2', userId: 'u-legit-admin', tokenHash: 'h2', expiresAt: new Date(Date.now() + 86_400_000) } })
  await db.mfaChallenge.create({ data: { userId: 'seed_admin_001', tokenHash: 'c1', expiresAt: new Date(Date.now() + 60_000) } })
  await db.wishlistItem.create({ data: { id: 'w1', userId: 'u_e2e_customer_fixture', productId: 'p1' } })
  // The demo account's orders: a real customer's paid order wrongly attached to it, and paid
  // Paysera orders. They and their bonus rows must survive untouched.
  await db.order.createMany({ data: [
    order('1040', 'seed_admin_001', 'real-customer@example.test', { paymentStatus: 'paid' }),
    order('1072', 'seed_admin_001', 'admin@test.com', { paymentStatus: 'paid', paymentMethod: 'paysera', paymentProvider: 'paysera', paymentSessionId: 'sess-1072' }),
    order('1074', 'seed_admin_001', 'admin@test.com', { paymentStatus: 'paid', paymentMethod: 'paysera', paymentProvider: 'paysera', paymentSessionId: 'sess-1074' }),
    order('1088', 'u-real-customer', 'real-customer@example.test', { paymentStatus: 'paid' }),
  ] })
  await db.bonusTransaction.createMany({ data: [
    bonus('b-1040', 'seed_admin_001', '1040', 7, 7, '2026-08-25T09:30:58Z'),
    bonus('b-1072', 'seed_admin_001', '1072', 26, 33, '2026-09-24T14:24:05Z'),
    bonus('b-real', 'u-real-customer', '1088', 5, 5, '2026-10-01T10:00:00Z'),
    // The E2E customer's detached test credits (their order links were cleared earlier).
    bonus(CUSTOMER_BONUS[0], 'u_e2e_customer_fixture', null, 20, 20, '2026-08-11T08:53:10Z'),
    bonus(CUSTOMER_BONUS[1], 'u_e2e_customer_fixture', null, 20, 40, '2026-08-11T08:53:30Z'),
  ] })
  const demoActor = { id: 'seed_admin_001', email: 'admin@test.com', name: 'Admin1234', platformRole: 'admin' } as never
  await db.$transaction((tx) => audit.appendServerAudit(tx, new NextRequest('http://localhost/x'), demoActor, {
    action: 'order.status_changed', entityType: 'order', entityId: '1040',
  }))
})

afterAll(async () => {
  await db?.$disconnect()
  await socket?.stop()
  await pg?.close()
})

describe('test account clean-up (variant A)', () => {
  it('plans neutralize for the demo account and delete for all three fixtures', async () => {
    const plan = await review()
    expect(outcomes(plan)).toEqual({
      seed_admin_001: 'neutralize',
      u_e2e_admin_fixture: 'delete',
      u_e2e_manager_fixture: 'delete',
      u_e2e_customer_fixture: 'delete',
    })
    expect(plan.decisions.find((d) => d.id === 'u_e2e_customer_fixture')?.reasons)
      .toEqual(['WishlistItem.userId=1', 'test bonus rows=2 (20+20 points, balance 40)'])
    expect(plan).toMatchObject({ refused: false, changes: 4 })
  })

  it('changes nothing when the confirmation does not match', async () => {
    const before = await dump()
    await expect(apply('0000000000000000')).rejects.toThrow(/state changed since review/)
    expect(await dump()).toEqual(before)
  })

  it('rolls back everything when a step fails midway', async () => {
    const before = await dump()
    await pg.exec(`
      CREATE FUNCTION refuse_manager_delete() RETURNS trigger AS $$
      BEGIN IF OLD.id = 'u_e2e_manager_fixture' THEN RAISE EXCEPTION 'simulated failure'; END IF; RETURN OLD; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER refuse_manager_delete BEFORE DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION refuse_manager_delete();`)
    try {
      await expect(apply((await review()).fingerprint)).rejects.toThrow(/simulated failure/)
    } finally {
      await pg.exec('DROP TRIGGER refuse_manager_delete ON "User"; DROP FUNCTION refuse_manager_delete();')
    }
    // The demo account was neutralized and a fixture deleted before the failure: all undone.
    expect(await dump()).toEqual(before)
  })

  it('rolls back when anything outside the plan changes (invariant check)', async () => {
    const before = await dump()
    // A side effect the script does not expect: deleting a fixture also edits a paid order.
    await pg.exec(`
      CREATE FUNCTION touch_order() RETURNS trigger AS $$
      BEGIN IF OLD.id = 'u_e2e_admin_fixture' THEN UPDATE "Order" SET "paymentStatus" = 'refunded' WHERE id = '1072'; END IF; RETURN OLD; END $$ LANGUAGE plpgsql;
      CREATE TRIGGER touch_order BEFORE DELETE ON "User" FOR EACH ROW EXECUTE FUNCTION touch_order();`)
    try {
      await expect(apply((await review()).fingerprint)).rejects.toThrow(/invariant violated \(orders\)/)
    } finally {
      await pg.exec('DROP TRIGGER touch_order ON "User"; DROP FUNCTION touch_order();')
    }
    expect(await dump()).toEqual(before)
  })

  it('applies exactly the reviewed plan; orders, payments, other bonus rows, users and history stay', async () => {
    const before = await dump()
    const { applied } = await apply((await review()).fingerprint)
    expect(applied.map((change) => [change.id, change.outcome, change.removed])).toEqual([
      ['seed_admin_001', 'neutralize', { 'MfaChallenge.userId': 1 }],
      ['u_e2e_admin_fixture', 'delete', {}],
      ['u_e2e_manager_fixture', 'delete', {}],
      ['u_e2e_customer_fixture', 'delete', { 'WishlistItem.userId': 1, 'BonusTransaction.userId': 2 }],
    ])
    const after = await dump()

    const demo = after.users.find((u) => u.id === 'seed_admin_001')!
    expect(await bcrypt.compare(OLD_PASSWORD, demo.passwordHash)).toBe(false)
    expect(demo).toMatchObject({ platformRole: 'customer', bonusPoints: 33, mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaEnrolledAt: null })
    expect(after.challenges).toEqual([])
    expect(after.users.map((u) => u.id).sort()).toEqual(['seed_admin_001', 'u-legit-admin', 'u-operator', 'u-real-customer'])
    for (const id of ['u-legit-admin', 'u-operator', 'u-real-customer']) {
      expect(after.users.find((u) => u.id === id)).toEqual(before.users.find((u) => u.id === id))
    }
    expect(after.sessions).toEqual(before.sessions)
    expect(after.orders).toEqual(before.orders)
    expect(after.bonus).toEqual(before.bonus.filter((row) => !CUSTOMER_BONUS.includes(row.id)))
    expect(after.wishlist).toEqual([])

    expect(after.audit.slice(0, before.audit.length)).toEqual(before.audit)
    expect(after.audit.slice(before.audit.length).map((row) => [row.action, row.entityId, row.actorUserId])).toEqual([
      ['user.test_account_neutralized', 'seed_admin_001', 'u-operator'],
      ['user.test_account_deleted', 'u_e2e_admin_fixture', 'u-operator'],
      ['user.test_account_deleted', 'u_e2e_manager_fixture', 'u-operator'],
      ['user.test_account_deleted', 'u_e2e_customer_fixture', 'u-operator'],
    ])
    expect(after.audit.at(-1)?.before).toMatchObject({ bonusPoints: 40, bonusRows: [{ id: CUSTOMER_BONUS[0], points: 20 }, { id: CUSTOMER_BONUS[1], points: 20 }] })
    expect(audit.verifyAuditIntegrity(after.audit).valid).toBe(true)
    expect(JSON.stringify(after.audit, (_k, v) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain(demo.passwordHash)
  })

  it('is idempotent: a second run plans and writes nothing', async () => {
    const plan = await review()
    expect(Object.values(outcomes(plan))).toEqual(['noop', 'noop', 'noop', 'noop'])
    const before = await dump()
    await apply(plan.fingerprint)
    expect(await dump()).toEqual(before)
  })

  it('refuses everything when a target has regained admin access', async () => {
    await db.user.update({ where: { id: 'seed_admin_001' }, data: { platformRole: 'admin' } })
    const plan = await review()
    expect(plan.refused).toBe(true)
    await expect(apply(plan.fingerprint)).rejects.toThrow(/refused/)
    await db.user.update({ where: { id: 'seed_admin_001' }, data: { platformRole: 'customer' } })
  })
})
