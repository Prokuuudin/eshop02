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
    user('seed_admin_001', 'admin@test.com', { name: 'Admin1234', mfaEnabled: true, mfaSecret: 'enc', mfaBackupCodes: ['a', 'b'], mfaEnrolledAt: new Date() }),
    user('u_e2e_admin_fixture', 'e2e-admin@hairshoppro.lv.local', { name: 'E2E Admin' }),
    user('u_e2e_manager_fixture', 'e2e-manager@hairshoppro.lv.local', { name: 'E2E Manager', companyId: 'company_x', companyName: 'X' }),
    user('u_e2e_customer_fixture', 'e2e-customer@hairshoppro.lv.local', { name: 'E2E Customer' }),
  ] })
  await db.session.create({ data: { id: 's1', userId: 'seed_admin_001', tokenHash: 'h1', expiresAt: new Date(Date.now() + 86_400_000) } })
  await db.session.create({ data: { id: 's2', userId: 'u-legit-admin', tokenHash: 'h2', expiresAt: new Date(Date.now() + 86_400_000) } })
  await db.mfaChallenge.create({ data: { userId: 'seed_admin_001', tokenHash: 'c1', expiresAt: new Date(Date.now() + 60_000) } })
  await db.wishlistItem.create({ data: { id: 'w1', userId: 'u_e2e_manager_fixture', productId: 'p1' } })
  await db.order.create({ data: {
    id: 'o1', createdAt: new Date(), userId: 'u_e2e_customer_fixture', email: 'e2e-customer@hairshoppro.lv.local', items: [],
    subtotal: 10, tax: 0, delivery: 0, discount: 0, total: 10, firstName: 'E2E', lastName: 'Customer', phone: '1',
    address: 'x', city: 'y', deliveryMethod: 'pickup', paymentMethod: 'bank',
  } })
  // History written by the demo account while it was an admin: must survive untouched.
  const demoActor = { id: 'seed_admin_001', email: 'admin@test.com', name: 'Admin1234', platformRole: 'admin' } as never
  await db.$transaction((tx) => audit.appendServerAudit(tx, new NextRequest('http://localhost/x'), demoActor, {
    action: 'product.update', entityType: 'product', entityId: 'p1',
  }))
})

afterAll(async () => {
  await db?.$disconnect()
  await socket?.stop()
  await pg?.close()
})

describe('test account clean-up', () => {
  it('reviews read-only and only plans the reviewed targets', async () => {
    const plan = await review()
    expect(outcomes(plan)).toEqual({
      seed_admin_001: 'neutralize',
      u_e2e_admin_fixture: 'delete',
      u_e2e_manager_fixture: 'delete',
      u_e2e_customer_fixture: 'blocked',
    })
    expect(plan.decisions.find((d) => d.id === 'u_e2e_customer_fixture')?.reasons).toEqual(['Order.userId=1', 'Order.email=1'])
    expect(plan.refused).toBe(false)
    expect(plan.changes).toBe(3)
  })

  it('changes nothing when the confirmation does not match the current plan', async () => {
    const before = await db.user.count()
    await expect(apply('0000000000000000')).rejects.toThrow(/state changed since review/)
    expect(await db.user.count()).toBe(before)
    expect(await db.session.count({ where: { userId: 'seed_admin_001' } })).toBe(1)
  })

  it('applies exactly the reviewed plan and keeps legitimate accounts and history', async () => {
    const legitBefore = await db.user.findUniqueOrThrow({ where: { id: 'u-legit-admin' } })
    const historyBefore = await db.auditLog.findMany({ orderBy: { sequence: 'asc' } })
    const plan = await review()

    const { applied } = await apply(plan.fingerprint)
    expect(applied.map((change) => [change.id, change.outcome])).toEqual([
      ['seed_admin_001', 'neutralize'],
      ['u_e2e_admin_fixture', 'delete'],
      ['u_e2e_manager_fixture', 'delete'],
      ['u_e2e_customer_fixture', 'blocked'],
    ])

    const demo = await db.user.findUniqueOrThrow({ where: { id: 'seed_admin_001' } })
    expect(await bcrypt.compare(OLD_PASSWORD, demo.passwordHash)).toBe(false)
    expect(demo).toMatchObject({ platformRole: 'customer', mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaEnrolledAt: null })
    expect(await db.session.count({ where: { userId: 'seed_admin_001' } })).toBe(0)
    expect(await db.mfaChallenge.count({ where: { userId: 'seed_admin_001' } })).toBe(0)

    expect(await db.user.findUnique({ where: { id: 'u_e2e_admin_fixture' } })).toBeNull()
    expect(await db.user.findUnique({ where: { id: 'u_e2e_manager_fixture' } })).toBeNull()
    expect(await db.wishlistItem.count({ where: { userId: 'u_e2e_manager_fixture' } })).toBe(0)
    expect(await db.user.findUnique({ where: { id: 'u_e2e_customer_fixture' } })).not.toBeNull()
    expect(await db.order.findUnique({ where: { id: 'o1' } })).not.toBeNull()

    expect(await db.user.findUniqueOrThrow({ where: { id: 'u-legit-admin' } })).toEqual(legitBefore)
    expect(await db.session.count({ where: { userId: 'u-legit-admin' } })).toBe(1)

    const history = await db.auditLog.findMany({ orderBy: { sequence: 'asc' } })
    expect(history.slice(0, historyBefore.length)).toEqual(historyBefore)
    expect(history.slice(historyBefore.length).map((row) => [row.action, row.entityId, row.actorUserId])).toEqual([
      ['user.test_account_neutralized', 'seed_admin_001', 'u-operator'],
      ['user.test_account_deleted', 'u_e2e_admin_fixture', 'u-operator'],
      ['user.test_account_deleted', 'u_e2e_manager_fixture', 'u-operator'],
    ])
    expect(audit.verifyAuditIntegrity(history).valid).toBe(true)
    expect(JSON.stringify(history, (_key, value) => (typeof value === 'bigint' ? value.toString() : value))).not.toContain(demo.passwordHash)
  })

  it('is idempotent: a second run plans and writes nothing', async () => {
    const plan = await review()
    expect(outcomes(plan)).toEqual({
      seed_admin_001: 'noop',
      u_e2e_admin_fixture: 'noop',
      u_e2e_manager_fixture: 'noop',
      u_e2e_customer_fixture: 'blocked',
    })
    expect(plan.changes).toBe(0)
    const auditRows = await db.auditLog.count()
    const demoBefore = await db.user.findUniqueOrThrow({ where: { id: 'seed_admin_001' } })
    await apply(plan.fingerprint)
    expect(await db.auditLog.count()).toBe(auditRows)
    expect(await db.user.findUniqueOrThrow({ where: { id: 'seed_admin_001' } })).toEqual(demoBefore)
  })

  it('refuses everything when a target has regained admin access', async () => {
    await db.user.update({ where: { id: 'seed_admin_001' }, data: { platformRole: 'admin' } })
    const plan = await review()
    expect(plan.refused).toBe(true)
    expect(plan.decisions.find((d) => d.id === 'seed_admin_001')?.outcome).toBe('abort')
    await expect(apply(plan.fingerprint)).rejects.toThrow(/refused/)
    await db.user.update({ where: { id: 'seed_admin_001' }, data: { platformRole: 'customer' } })
  })

  it('snapshots touched rows without credentials', async () => {
    const snapshot = await db.$transaction((tx) => cleanup.snapshotCleanupRows(tx))
    const text = JSON.stringify(snapshot)
    expect(text).toContain('seed_admin_001')
    expect(text).not.toMatch(/\$2[aby]\$/)
    expect((snapshot.User as Array<Record<string, unknown>>).every((row) => String(row.passwordHash).startsWith('sha256:'))).toBe(true)
  })
})
