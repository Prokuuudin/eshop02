import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Runs the BUG-002 customer editing flow against a real PostgreSQL database.
// Only for a disposable database (e.g. a schema-only Neon branch):
//   BUG002_PG_TEST=1 DATABASE_URL=<branch url> npx vitest run --config vitest.postgres.config.ts admin-customer-edit
// All fixture data is synthetic (example.test addresses, made-up names and numbers).
const databaseUrl = process.env.DATABASE_URL ?? ''
if (process.env.BUG002_PG_TEST !== '1' || !databaseUrl || databaseUrl.includes('ep-long-glitter')) {
  throw new Error('Refusing to run: set BUG002_PG_TEST=1 and point DATABASE_URL at a disposable test database')
}

const auth = vi.hoisted(() => ({ caller: null as Record<string, unknown> | null, sessionUser: null as Record<string, unknown> | null }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({
  SESSION_COOKIE: 'eshop_session',
  requireAdminPermission: async (permission: string) => {
    const { hasAdminPermission } = await import('@/lib/admin-permissions')
    return hasAdminPermission(auth.caller as never, permission as never) ? auth.caller : NextResponse.json({ error: 'forbidden' }, { status: 403 })
  },
  getServerUser: async () => auth.sessionUser,
  verifyPassword: async (password: string, hash: string) => hash === `test-hash:${password}`,
}))
vi.mock('@/lib/mfa', () => ({ decryptSecret: (secret: string) => secret, verifyTotpCode: async (_secret: string, code: string) => code === '123456' }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ limited: false, remaining: 1, resetAt: Date.now() }) }))

import { prisma } from '@/lib/prisma'
import { GET as getCustomer, PATCH as patchCustomer } from '@/app/api/admin/customers/[id]/route'
import { GET as getProfile, PATCH as patchProfile } from '@/app/api/user/profile/route'
import { GET as myOrders } from '@/app/api/orders/my/route'

const P = 'bug002-it'
const ids = {
  admin: `${P}-admin`, customer: `${P}-customer`, other: `${P}-other`, company: `${P}-company`, otherCompany: `${P}-company-2`,
  member: `${P}-member`, address: `${P}-address`, ownOrder: `${P}-order-own`, guestOrder: `${P}-order-guest`,
}
const ADMIN = { id: ids.admin, email: `${P}-admin@example.test`, platformRole: 'admin', superAdmin: false, approvalRequired: false, auditLoggingEnabled: false, bonusPoints: 0, mustChangePassword: false, createdAt: new Date().toISOString() }
const STEP_UP = { currentPassword: 'correct-password', mfaCode: '123456' }
const order = (id: string, userId: string | null, email: string) => ({
  id, createdAt: new Date(), items: [], subtotal: 10, tax: 0, delivery: 0, total: 10, deliveryMethod: 'pickup', paymentMethod: 'cash',
  firstName: 'Test', lastName: 'Buyer', email, phone: '+37120000099', address: 'Test street 1', city: 'Riga', userId,
})

async function cleanup(): Promise<void> {
  const users = Object.values(ids)
  await prisma.session.deleteMany({ where: { userId: { in: users } } })
  await prisma.passwordResetToken.deleteMany({ where: { userId: { in: users } } })
  await prisma.invitationToken.deleteMany({ where: { userId: { in: users } } })
  await prisma.savedAddress.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.companyMember.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.order.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.user.deleteMany({ where: { id: { startsWith: P } } })
  await prisma.company.deleteMany({ where: { id: { startsWith: P } } })
}

async function seed(): Promise<void> {
  await cleanup()
  await prisma.user.create({ data: { id: ids.admin, email: ADMIN.email, passwordHash: 'test-hash:correct-password', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'secret' } })
  await prisma.company.create({ data: { id: ids.company, companyName: 'Test Customer', cardNumber: '880001' } })
  await prisma.company.create({ data: { id: ids.otherCompany, companyName: 'SIA Other Test', cardNumber: '880100' } })
  await prisma.user.create({ data: {
    id: ids.customer, email: `${P}-old@example.test`, passwordHash: 'x', name: 'Test Customer', phone: '+37120000001', cardNumber: '880001',
    companyId: ids.company, teamRole: 'admin', checkoutProfile: { firstName: 'Test', lastName: 'Customer', phone: '+37120000001', address: 'Test street 1', city: 'Riga', postalCode: 'LV-1001' },
  } })
  await prisma.user.create({ data: { id: ids.other, email: `${P}-other@example.test`, passwordHash: 'x', name: 'Other Test', phone: '+371 2000 0002', cardNumber: '880002' } })
  await prisma.companyMember.create({ data: { id: ids.member, companyId: ids.company, userId: ids.customer, email: `${P}-old@example.test`, name: 'Test Customer', role: 'admin' } })
  await prisma.savedAddress.create({ data: { id: ids.address, userId: ids.customer, email: `${P}-old@example.test`, firstName: 'Test', lastName: 'Customer', phone: '+37120000001', address: 'Test street 1', city: 'Riga' } })
  await prisma.order.create({ data: order(ids.ownOrder, ids.customer, `${P}-old@example.test`) })
  await prisma.order.create({ data: order(ids.guestOrder, null, `${P}-guest@example.test`) })
  await prisma.session.create({ data: { id: `${P}-session`, userId: ids.customer, tokenHash: `${P}-token-hash`, expiresAt: new Date(Date.now() + 86_400_000) } })
  await prisma.passwordResetToken.create({ data: { id: `${P}-reset`, userId: ids.customer, tokenHash: `${P}-reset-hash`, expiresAt: new Date(Date.now() + 86_400_000) } })
  await prisma.invitationToken.create({ data: { id: `${P}-invite`, tokenHash: `${P}-invite-hash`, userId: ids.customer, email: `${P}-old@example.test`, cardNumber: '880001', expiresAt: new Date(Date.now() + 86_400_000) } })
  await prisma.invitationToken.create({ data: { id: `${P}-invite-other`, tokenHash: `${P}-invite-other-hash`, userId: ids.other, email: `${P}-other@example.test`, cardNumber: '880200', expiresAt: new Date(Date.now() + 86_400_000) } })
}

const version = async (): Promise<string> => (await prisma.user.findUniqueOrThrow({ where: { id: ids.customer } })).updatedAt.toISOString()
const companyVersion = async (): Promise<string> => (await prisma.company.findUniqueOrThrow({ where: { id: ids.company } })).updatedAt.toISOString()
const adminPatch = async (body: Record<string, unknown>) => patchCustomer(
  new NextRequest(`https://shop.test/api/admin/customers/${ids.customer}`, { method: 'PATCH', body: JSON.stringify(body), headers: { origin: 'https://shop.test' } }),
  { params: Promise.resolve({ id: ids.customer }) },
)
const edit = async (changes: Record<string, unknown>, extra: Record<string, unknown> = {}) => adminPatch({
  expectedUpdatedAt: await version(), expectedCompanyUpdatedAt: await companyVersion(), reason: 'integration test edit', changes, ...extra,
})

beforeEach(async () => {
  auth.caller = ADMIN
  auth.sessionUser = null
  await seed()
})
afterAll(async () => {
  await cleanup()
})

describe('BUG-002 customer editing on PostgreSQL', () => {
  it('changes the email with step-up: linked copies move, credentials are revoked, orders keep history', async () => {
    const ordersBefore = await prisma.order.findMany({ where: { id: { startsWith: P } }, orderBy: { id: 'asc' } })
    const response = await edit({ email: `${P}-NEW@example.test`, lastName: 'Renamed' }, STEP_UP)
    expect(response.status).toBe(200)

    expect(await prisma.user.findUniqueOrThrow({ where: { id: ids.customer } })).toMatchObject({ email: `${P}-new@example.test`, name: 'Test Renamed' })
    expect(await prisma.companyMember.findUniqueOrThrow({ where: { id: ids.member } })).toMatchObject({ email: `${P}-new@example.test`, name: 'Test Renamed' })
    expect((await prisma.savedAddress.findUniqueOrThrow({ where: { id: ids.address } })).email).toBe(`${P}-new@example.test`)
    expect(await prisma.session.count({ where: { userId: ids.customer } })).toBe(0)
    expect(await prisma.passwordResetToken.count({ where: { userId: ids.customer } })).toBe(0)
    expect(await prisma.invitationToken.count({ where: { userId: ids.customer } })).toBe(0)
    expect(await prisma.invitationToken.count({ where: { userId: ids.other } })).toBe(1)
    expect(await prisma.order.findMany({ where: { id: { startsWith: P } }, orderBy: { id: 'asc' } })).toEqual(ordersBefore)

    const audit = await prisma.auditLog.findFirstOrThrow({ where: { entityId: ids.customer, action: 'customer.email_changed' }, orderBy: { sequence: 'desc' } })
    expect(audit).toMatchObject({ reason: 'integration test edit', actorUserId: ids.admin })
    expect(audit.integrityHash).toMatch(/^[0-9a-f]{64}$/u)
  })

  it('lets exactly one of two concurrent edits based on the same version win', async () => {
    const base = { expectedUpdatedAt: await version(), reason: 'concurrent edit' }
    const results = await Promise.all([
      adminPatch({ ...base, changes: { phone: '+37120000011' } }),
      adminPatch({ ...base, changes: { phone: '+37120000012' } }),
    ])
    expect(results.map((r) => r.status).sort()).toEqual([200, 409])
    const phone = (await prisma.user.findUniqueOrThrow({ where: { id: ids.customer } })).phone
    expect(['+37120000011', '+37120000012']).toContain(phone)
    expect(await prisma.auditLog.count({ where: { entityId: ids.customer, reason: 'concurrent edit' } })).toBe(1)
  })

  it('finds a phone duplicate across formatting with the raw SQL matcher, without merging', async () => {
    const response = await edit({ phone: '20000002' })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'duplicate_confirmation_required', details: { duplicates: [{ field: 'phone', userId: ids.other }] } })
    expect((await edit({ phone: '20000002' }, { confirmDuplicates: true })).status).toBe(200)
    expect(await prisma.user.count({ where: { id: { in: [ids.customer, ids.other] } } })).toBe(2)
  })

  it('protects card numbers held by companies and live invitations, then moves the card with the company', async () => {
    expect(await (await edit({ cardNumber: '880100' })).json()).toEqual({ error: 'card_taken' })
    expect(await (await edit({ cardNumber: '880200' })).json()).toEqual({ error: 'card_taken' })
    expect((await edit({ cardNumber: '880300' })).status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.customer } })).cardNumber).toBe('880300')
    expect((await prisma.company.findUniqueOrThrow({ where: { id: ids.company } })).cardNumber).toBe('880300')
    expect(await prisma.invitationToken.count({ where: { userId: ids.customer } })).toBe(0)
  })

  it('refuses the customer\'s stale account form after a staff correction, then accepts a fresh one', async () => {
    auth.sessionUser = { id: ids.customer, email: `${P}-old@example.test` }
    const stale = (await (await getProfile()).json() as { profile: { updatedAt: string } }).profile.updatedAt
    expect((await edit({ phone: '+37120000021' })).status).toBe(200)

    const profilePatch = (expectedUpdatedAt: string) => patchProfile(new NextRequest('https://shop.test/api/user/profile', {
      method: 'PATCH', headers: { origin: 'https://shop.test', cookie: 'eshop_session=t' },
      body: JSON.stringify({ expectedUpdatedAt, phone: '+37120000001', checkoutProfile: { customerType: 'individual', firstName: 'Test', lastName: 'Customer', phone: '+37120000001' } }),
    }))
    const rejected = await profilePatch(stale)
    expect(rejected.status).toBe(409)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: ids.customer } })).phone).toBe('+37120000021')

    const fresh = (await (await getProfile()).json() as { profile: { updatedAt: string; phone: string } }).profile
    expect(fresh.phone).toBe('+37120000021')
    expect((await profilePatch(fresh.updatedAt)).status).toBe(200)
  })

  it('does not show another email\'s guest orders after an email change, and keeps the customer\'s own', async () => {
    expect(await (await edit({ email: `${P}-guest@example.test` }, STEP_UP)).json()).toEqual({ error: 'guest_orders_confirmation_required', details: { guestOrders: 1 } })
    expect((await edit({ email: `${P}-fresh@example.test` }, STEP_UP)).status).toBe(200)
    auth.sessionUser = { id: ids.customer, email: `${P}-fresh@example.test` }
    const { orders } = await (await myOrders(new NextRequest('https://shop.test/api/orders/my'))).json() as { orders: Array<{ id: string }> }
    expect(orders.map((o) => o.id)).toEqual([ids.ownOrder])
  })

  it('serves the canonical card to staff', async () => {
    const response = await getCustomer(new NextRequest(`https://shop.test/api/admin/customers/${ids.customer}`), { params: Promise.resolve({ id: ids.customer }) })
    expect(await response.json()).toMatchObject({ canEdit: true, customer: { canonical: { firstName: 'Test', lastName: 'Customer', cardNumber: '880001' }, company: { id: ids.company, otherMembers: 0 }, linkedOrders: 1 } })
  })
})
