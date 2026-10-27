import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// In-memory stand-in for the Prisma tables this endpoint touches. `$transaction` restores a
// snapshot when the callback throws, so atomicity is asserted on real state, not on call order.
type Row = Record<string, unknown>

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Array<Record<string, unknown>>>,
  caller: null as Record<string, unknown> | null,
  rateLimited: false,
  failAudit: false,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const clone = <T,>(value: T): T => structuredClone(value)
  const cond = (value: unknown, c: unknown): boolean => {
    if (c === null) return value === null || value === undefined
    if (c instanceof Date) return value instanceof Date && value.getTime() === c.getTime()
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>
      if ('equals' in o) return o.mode === 'insensitive' ? String(value ?? '').toLowerCase() === String(o.equals).toLowerCase() : value === o.equals
      if ('not' in o) return !cond(value, o.not)
      if ('gt' in o) return value instanceof Date && value > (o.gt as Date)
      if ('startsWith' in o) return typeof value === 'string' && value.startsWith(String(o.startsWith))
      if ('in' in o) return (o.in as unknown[]).includes(value)
    }
    return value === c
  }
  const matches = (row: Row, where: Row = {}): boolean => Object.entries(where).every(([key, c]) =>
    key === 'NOT' ? !matches(row, c as Row) : key === 'OR' ? (c as Row[]).some((w) => matches(row, w)) : cond(row[key], c))
  const model = (name: string) => {
    const rows = (): Row[] => (state.tables[name] ??= [])
    const touch = (row: Row, data: Row) => Object.assign(row, data, 'updatedAt' in row && !('updatedAt' in data) ? { updatedAt: new Date(Date.now() + 1000) } : {})
    return {
      findUnique: async ({ where }: { where: Row }) => clone(rows().find((r) => matches(r, where)) ?? null),
      findUniqueOrThrow: async ({ where }: { where: Row }) => {
        const row = rows().find((r) => matches(r, where))
        if (!row) throw new Error('not found')
        return clone(row)
      },
      findFirst: async ({ where }: { where?: Row }) => clone(rows().find((r) => matches(r, where)) ?? null),
      findMany: async ({ where, take }: { where?: Row; take?: number }) => clone(rows().filter((r) => matches(r, where)).slice(0, take ?? Infinity)),
      count: async ({ where }: { where?: Row } = {}) => rows().filter((r) => matches(r, where)).length,
      create: async ({ data }: { data: Row }) => { rows().push(clone(data)); return clone(data) },
      update: async ({ where, data }: { where: Row; data: Row }) => {
        const row = rows().find((r) => matches(r, where))
        if (!row) throw new Error('not found')
        return clone(touch(row, data))
      },
      updateMany: async ({ where, data }: { where: Row; data: Row }) => {
        const hit = rows().filter((r) => matches(r, where))
        hit.forEach((row) => touch(row, data))
        return { count: hit.length }
      },
      deleteMany: async ({ where }: { where: Row }) => {
        const before = rows().length
        state.tables[name] = rows().filter((r) => !matches(r, where))
        return { count: before - state.tables[name].length }
      },
    }
  }
  const names = ['user', 'savedAddress', 'company', 'companyMember', 'order', 'invoice', 'invitationToken', 'session', 'passwordResetToken', 'mfaChallenge', 'accessRequest', 'auditLog']
  const db: Record<string, unknown> = Object.fromEntries(names.map((name) => [name, model(name)]))
  db.$queryRaw = async (_strings: TemplateStringsArray, id: string, key: string) => (state.tables.user ?? [])
    .filter((u) => u.id !== id && String(u.phone ?? '').replace(/\D/gu, '').slice(-8) === key)
    .map((u) => ({ id: u.id, cardNumber: u.cardNumber }))
  db.$transaction = async (fn: (tx: unknown) => Promise<unknown>) => {
    const snapshot = structuredClone(state.tables)
    try {
      return await fn(db)
    } catch (error) {
      state.tables = snapshot
      throw error
    }
  }
  return { prisma: db }
})
vi.mock('@/lib/server-auth', () => ({
  requireAdminPermission: async (permission: string) => {
    const { hasAdminPermission } = await import('@/lib/admin-permissions')
    return hasAdminPermission(state.caller as never, permission as never)
      ? state.caller
      : NextResponse.json({ error: 'forbidden', permission }, { status: 403 })
  },
  verifyPassword: async (password: string, hash: string) => hash === `hash:${password}`,
}))
vi.mock('@/lib/mfa', () => ({ decryptSecret: (secret: string) => secret, verifyTotpCode: async (_secret: string, code: string) => code === '123456' }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: async () => ({ limited: state.rateLimited, remaining: 1, resetAt: Date.now() }) }))
vi.mock('@/lib/server-audit', () => ({
  appendServerAudit: async (tx: { auditLog: { create: (args: { data: Row }) => Promise<unknown> } }, _req: unknown, actor: { id: string; email: string }, input: Row) => {
    if (state.failAudit) throw new Error('audit unavailable')
    await tx.auditLog.create({ data: { ...input, actorUserId: actor.id, adminEmail: actor.email, adminName: null, at: new Date(), sequence: (state.tables.auditLog ?? []).length + 1 } })
  },
}))

import { GET, PATCH } from './route'

const T0 = new Date('2026-10-27T10:00:00.000Z')
const T_COMPANY = new Date('2026-10-27T09:00:00.000Z')
const ADMIN = { id: 'admin-1', email: 'admin@example.test', platformRole: 'admin', superAdmin: false }
const SUPER_ADMIN = { id: 'admin-2', email: 'super@example.test', platformRole: 'admin', superAdmin: true }
const MANAGER = { id: 'manager-1', email: 'manager@example.test', platformRole: 'customer', teamRole: 'manager' }
const STEP_UP = { currentPassword: 'correct-password', mfaCode: '123456' }

const customer = (fields: Row = {}): Row => ({
  id: 'c1', email: 'anna.old@example.test', name: 'Anna Example', phone: '+37120000001', cardNumber: '9001',
  customerType: 'individual', companyName: null, registrationNumber: null, vatNumber: null, legalAddress: null,
  checkoutProfile: { firstName: 'Anna', lastName: 'Example', phone: '+37120000001', address: 'Street 1', city: 'Riga', postalCode: 'LV-1001' },
  platformRole: 'customer', teamRole: 'admin', superAdmin: false, companyId: 'co1', bonusPoints: 500,
  privacyAcknowledgedAt: T0, avatarUrl: null, updatedAt: T0, ...fields,
})

function seed(): void {
  const address = { firstName: 'Anna', lastName: 'Example', phone: '+37120000001', address: 'Street 1', city: 'Riga', postalCode: 'LV-1001' }
  state.tables = {
    user: [
      customer(),
      customer({ id: 'c2', email: 'other@example.test', name: 'Other Person', phone: '+37120000002', cardNumber: '9002', companyId: null, customerType: 'company', companyName: 'SIA Other', registrationNumber: '40000000002', checkoutProfile: null }),
      { ...customer({ id: 'staff-1', email: 'staff@example.test', cardNumber: null, companyId: null }), platformRole: 'admin', teamRole: null },
      { id: 'admin-1', email: 'admin@example.test', platformRole: 'admin', passwordHash: 'hash:correct-password', mfaEnabled: true, mfaSecret: 'secret', updatedAt: T0 },
    ],
    company: [
      { id: 'co1', companyName: 'Anna Example', cardNumber: '9001', registrationNumber: null, taxId: null, address: null, updatedAt: T_COMPANY },
      { id: 'co2', companyName: 'SIA Card Holder', cardNumber: '9100', registrationNumber: null, taxId: null, address: null, updatedAt: T_COMPANY },
    ],
    companyMember: [{ id: 'm1', companyId: 'co1', userId: 'c1', email: 'anna.old@example.test', name: 'Anna Example', role: 'admin' }],
    savedAddress: [
      { id: 'a1', userId: 'c1', email: 'anna.old@example.test', ...address },
      { id: 'a2', userId: 'c2', email: 'other@example.test', ...address, firstName: 'Other' },
    ],
    order: [
      { id: 'o-own', userId: 'c1', email: 'anna.old@example.test', firstName: 'Anna', lastName: 'Example', phone: '+37120000001', address: 'Street 1', city: 'Riga', legalDetails: null },
      { id: 'o-guest', userId: null, email: 'guest@example.test', firstName: 'Guest', lastName: 'Buyer', phone: '+37120000099', address: 'Elsewhere 2', city: 'Riga', legalDetails: null },
    ],
    invoice: [{ id: 'inv-1', orderId: 'o-own', companyId: 'co1', items: [] }],
    invitationToken: [
      { id: 'it-pending', userId: 'c1', email: 'anna.old@example.test', cardNumber: '9001', status: 'sent', expiresAt: new Date(Date.now() + 86_400_000) },
      { id: 'it-accepted', userId: 'c1', email: 'anna.old@example.test', cardNumber: '9001', status: 'accepted', expiresAt: T0 },
      { id: 'it-other', userId: 'c2', email: 'other@example.test', cardNumber: '9200', status: 'sent', expiresAt: new Date(Date.now() + 86_400_000) },
    ],
    session: [{ id: 's1', userId: 'c1' }, { id: 's2', userId: 'c2' }],
    passwordResetToken: [{ id: 'r1', userId: 'c1' }],
    mfaChallenge: [{ id: 'mc1', userId: 'c1' }],
    accessRequest: [{ id: 'ar1', cardNumber: '9300', status: 'pending' }],
    auditLog: [],
  }
}

const table = (name: string): Row[] => state.tables[name]
const find = (name: string, id: string): Row => table(name).find((row) => row.id === id) as Row
const ordersSnapshot = () => structuredClone({ order: table('order'), invoice: table('invoice') })

const patch = (body: Row, { id = 'c1', origin = 'https://shop.test' } = {}) => PATCH(
  new NextRequest(`https://shop.test/api/admin/customers/${id}`, { method: 'PATCH', body: JSON.stringify(body), headers: { origin } }),
  { params: Promise.resolve({ id }) },
)
const get = (id = 'c1') => GET(new NextRequest(`https://shop.test/api/admin/customers/${id}`), { params: Promise.resolve({ id }) })
const edit = (changes: Row, extra: Row = {}) => patch({
  expectedUpdatedAt: T0.toISOString(), expectedCompanyUpdatedAt: T_COMPANY.toISOString(), reason: 'customer called to correct data', changes, ...extra,
})

beforeEach(() => {
  seed()
  state.caller = ADMIN
  state.rateLimited = false
  state.failAudit = false
})

describe('access control', () => {
  it('rejects cross-origin writes before anything else', async () => {
    const response = await patch({ expectedUpdatedAt: T0.toISOString(), reason: 'cross origin', changes: { phone: '+37120000005' } }, { origin: 'https://evil.test' })
    expect(response.status).toBe(403)
    expect(find('user', 'c1').phone).toBe('+37120000001')
  })

  it('denies staff managers the customers.update permission (they may still read)', async () => {
    state.caller = MANAGER
    const response = await edit({ phone: '+37120000005' })
    expect(response.status).toBe(403)
    expect(await response.json()).toMatchObject({ permission: 'customers.update' })
    const read = await get()
    expect(read.status).toBe(200)
    expect(await read.json()).toMatchObject({ canEdit: false })
  })

  it.each([['Admin', ADMIN], ['Super Admin', SUPER_ADMIN]])('lets an approved %s edit a customer', async (_label, caller) => {
    state.caller = caller
    expect((await edit({ phone: '+37120000005' })).status).toBe(200)
    expect(find('user', 'c1').phone).toBe('+37120000005')
  })

  it('never edits a staff account here, even for a Super Admin', async () => {
    state.caller = SUPER_ADMIN
    const response = await patch({ expectedUpdatedAt: T0.toISOString(), reason: 'staff account edit', changes: { phone: '+37120000005' } }, { id: 'staff-1' })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'staff_account' })
    state.caller = ADMIN
    expect((await get('staff-1')).status).toBe(403)
  })

  it('requires a reason for every change', async () => {
    const response = await patch({ expectedUpdatedAt: T0.toISOString(), changes: { phone: '+37120000005' } })
    expect(response.status).toBe(400)
    expect(find('user', 'c1').phone).toBe('+37120000001')
  })

  it('rejects role, password or MFA fields outright', async () => {
    for (const changes of [{ platformRole: 'admin' }, { superAdmin: true }, { mustChangePassword: false }, { bonusPoints: 9999 }]) {
      expect((await edit(changes)).status).toBe(400)
    }
    expect(find('user', 'c1')).toMatchObject({ platformRole: 'customer', bonusPoints: 500 })
  })
})

describe('contact data and linked records', () => {
  it('updates columns, profile mirrors and the company member atomically, with an audit entry', async () => {
    const orders = ordersSnapshot()
    const response = await edit({ firstName: 'Anna', lastName: 'Corrected', phone: '20 000 007' })
    expect(response.status).toBe(200)
    expect(find('user', 'c1')).toMatchObject({ name: 'Anna Corrected', phone: '+37120000007' })
    expect(find('user', 'c1').checkoutProfile).toMatchObject({ firstName: 'Anna', lastName: 'Corrected', phone: '+37120000007', address: 'Street 1' })
    expect(find('companyMember', 'm1')).toMatchObject({ name: 'Anna Corrected', email: 'anna.old@example.test' })
    expect(table('session')).toHaveLength(2)
    expect(ordersSnapshot()).toEqual(orders)
    const [audit] = table('auditLog')
    expect(audit).toMatchObject({
      action: 'customer.updated', entityType: 'user', entityId: 'c1', reason: 'customer called to correct data',
      before: { fields: { lastName: 'Example', phone: '+37120000001' } },
      after: { fields: { lastName: 'Corrected', phone: '+37120000007' } },
    })
  })

  it('returns field errors and writes nothing on invalid input', async () => {
    const response = await edit({ phone: '123', iban: 'LV12' })
    expect(response.status).toBe(400)
    const body = await response.json() as { error: string; details: unknown[] }
    expect(body.error).toBe('validation_failed')
    expect(body.details).toEqual(expect.arrayContaining([{ field: 'phone', code: 'invalid_phone' }, { field: 'iban', code: 'invalid_iban' }]))
    expect(table('auditLog')).toHaveLength(0)
  })

  it('rejects an edit that changes nothing', async () => {
    expect((await edit({ phone: '+37120000001' })).status).toBe(400)
  })

  it('edits a saved address with compare-and-set and refuses a stale or foreign one', async () => {
    const expected = { firstName: 'Anna', lastName: 'Example', phone: '+37120000001', address: 'Street 1', city: 'Riga', postalCode: 'LV-1001' }
    const stale = await edit({}, { savedAddresses: [{ id: 'a1', expected: { ...expected, city: 'Jelgava' }, next: { ...expected, address: 'Street 5' } }] })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toMatchObject({ error: 'address_conflict' })
    const foreign = await edit({}, { savedAddresses: [{ id: 'a2', expected: { ...expected, firstName: 'Other' }, next: { ...expected, address: 'Street 5' } }] })
    expect(foreign.status).toBe(404)
    const ok = await edit({}, { savedAddresses: [{ id: 'a1', expected, next: { ...expected, address: 'Street 5' } }] })
    expect(ok.status).toBe(200)
    expect(find('savedAddress', 'a1').address).toBe('Street 5')
    expect(find('savedAddress', 'a2').address).toBe('Street 1')
    // An address-only edit still bumps the version the customer's account form compares against.
    expect((find('user', 'c1').updatedAt as Date).getTime()).not.toBe(T0.getTime())
  })
})

describe('conflicts and atomicity', () => {
  it('rejects an edit based on an outdated version and leaves everything untouched', async () => {
    find('user', 'c1').updatedAt = new Date('2026-10-27T11:00:00.000Z')
    const response = await edit({ phone: '+37120000005' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'optimistic_conflict' })
    expect(find('user', 'c1').phone).toBe('+37120000001')
  })

  it('rolls back every linked write when the audit entry cannot be written', async () => {
    state.failAudit = true
    const response = await edit({ email: 'anna.new@example.test', lastName: 'Rolled' }, STEP_UP)
    expect(response.status).toBe(500)
    expect(find('user', 'c1')).toMatchObject({ email: 'anna.old@example.test', name: 'Anna Example' })
    expect(find('companyMember', 'm1')).toMatchObject({ email: 'anna.old@example.test', name: 'Anna Example' })
    expect(table('session')).toHaveLength(2)
    expect(table('invitationToken')).toHaveLength(3)
  })
})

describe('email change', () => {
  it('requires the acting admin\'s password and TOTP', async () => {
    const missing = await edit({ email: 'anna.new@example.test' })
    expect(missing.status).toBe(401)
    expect(await missing.json()).toEqual({ error: 'reauthentication_required' })
    const wrongCode = await edit({ email: 'anna.new@example.test' }, { ...STEP_UP, mfaCode: '000000' })
    expect(wrongCode.status).toBe(401)
    expect(await wrongCode.json()).toEqual({ error: 'reauthentication_failed' })
    const wrongPassword = await edit({ email: 'anna.new@example.test' }, { ...STEP_UP, currentPassword: 'guess' })
    expect(wrongPassword.status).toBe(401)
    expect(find('user', 'c1').email).toBe('anna.old@example.test')
  })

  it('rate-limits step-up attempts', async () => {
    state.rateLimited = true
    expect((await edit({ email: 'anna.new@example.test' }, STEP_UP)).status).toBe(429)
  })

  it('needs no step-up when the email is only re-cased', async () => {
    expect((await edit({ email: 'ANNA.OLD@example.test', phone: '+37120000005' })).status).toBe(200)
  })

  it('moves linked copies and revokes sessions, reset links, MFA challenges and unaccepted invitations', async () => {
    const orders = ordersSnapshot()
    const response = await edit({ email: 'Anna.New@Example.test' }, STEP_UP)
    expect(response.status).toBe(200)
    expect(find('user', 'c1').email).toBe('anna.new@example.test')
    expect(find('companyMember', 'm1').email).toBe('anna.new@example.test')
    expect(find('savedAddress', 'a1').email).toBe('anna.new@example.test')
    expect(table('session').map((s) => s.id)).toEqual(['s2'])
    expect(table('passwordResetToken')).toHaveLength(0)
    expect(table('mfaChallenge')).toHaveLength(0)
    expect(table('invitationToken').map((i) => i.id)).toEqual(['it-accepted', 'it-other'])
    // Order history keeps the email the order was placed with.
    expect(ordersSnapshot()).toEqual(orders)
    expect(table('auditLog')[0]).toMatchObject({
      action: 'customer.email_changed',
      before: { fields: { email: 'anna.old@example.test' } },
      after: { fields: { email: 'anna.new@example.test' } },
    })
    expect(JSON.parse(String(table('auditLog')[0].details))).toMatchObject({ sessionsRevoked: 1, resetTokensRevoked: 1, invitationsRevoked: 1, stepUp: true })
  })

  it('refuses an email held by another account, case-insensitively', async () => {
    const response = await edit({ email: 'OTHER@example.test' }, STEP_UP)
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'email_taken' })
  })

  it('refuses a service @client.local address', async () => {
    expect((await edit({ email: '9001@client.local' }, STEP_UP)).status).toBe(400)
  })

  it('does not expose someone else\'s guest orders unless staff confirm they are the customer\'s own', async () => {
    const blocked = await edit({ email: 'guest@example.test' }, STEP_UP)
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toEqual({ error: 'guest_orders_confirmation_required', details: { guestOrders: 1 } })
    expect(find('user', 'c1').email).toBe('anna.old@example.test')

    const confirmed = await edit({ email: 'guest@example.test' }, { ...STEP_UP, guestOrdersBelongToCustomer: true })
    expect(confirmed.status).toBe(200)
    // The guest order itself is not linked or rewritten.
    expect(find('order', 'o-guest')).toMatchObject({ userId: null, email: 'guest@example.test' })
    expect(JSON.parse(String(table('auditLog')[0].details))).toMatchObject({ guestOrdersAcknowledged: 1 })
  })
})

describe('card number', () => {
  it.each([
    ['another customer', '9002'],
    ['another company', '9100'],
    ['a live invitation for someone else', '9200'],
    ['a pending card application', '9300'],
  ])('refuses a card held by %s', async (_label, card) => {
    const response = await edit({ cardNumber: card })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'card_taken' })
    expect(find('user', 'c1').cardNumber).toBe('9001')
  })

  it('moves the card, keeps the sole-member company in step and retires invitations carrying the old card', async () => {
    const response = await edit({ cardNumber: '9400' })
    expect(response.status).toBe(200)
    expect(find('user', 'c1').cardNumber).toBe('9400')
    expect(find('company', 'co1').cardNumber).toBe('9400')
    expect(table('invitationToken').map((i) => i.id)).toEqual(['it-accepted', 'it-other'])
  })
})

describe('duplicates and shared companies', () => {
  it('warns about a possible duplicate and never merges customers', async () => {
    const changes = { customerType: 'company', companyName: 'SIA Anna', registrationNumber: '40000000002' }
    const warned = await edit(changes)
    expect(warned.status).toBe(409)
    expect(await warned.json()).toEqual({ error: 'duplicate_confirmation_required', details: { duplicates: [{ field: 'registrationNumber', userId: 'c2', cardNumber: '9002' }] } })
    const confirmed = await edit(changes, { confirmDuplicates: true })
    expect(confirmed.status).toBe(200)
    expect(table('user')).toHaveLength(4)
    expect(find('user', 'c2')).toMatchObject({ registrationNumber: '40000000002', cardNumber: '9002', email: 'other@example.test' })
  })

  it('detects a phone shared with another customer regardless of formatting', async () => {
    const response = await edit({ phone: '+371 2000 0002' })
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'duplicate_confirmation_required', details: { duplicates: [{ field: 'phone', userId: 'c2' }] } })
  })

  it('updates a company that belongs to this customer alone', async () => {
    const response = await edit({ customerType: 'company', companyName: 'SIA Anna', registrationNumber: '40000000011' })
    expect(response.status).toBe(200)
    expect(find('company', 'co1')).toMatchObject({ companyName: 'SIA Anna', registrationNumber: '40000000011' })
  })

  it('does not change a company shared with other customers without explicit confirmation', async () => {
    table('user').push(customer({ id: 'c3', email: 'colleague@example.test', cardNumber: '9003', phone: '+37120000003', companyId: 'co1' }))
    const changes = { customerType: 'company', companyName: 'SIA Anna', registrationNumber: '40000000011' }
    const blocked = await edit(changes)
    expect(blocked.status).toBe(409)
    expect(await blocked.json()).toEqual({ error: 'company_scope_required', details: { otherMembers: 1 } })
    expect(find('company', 'co1').companyName).toBe('Anna Example')

    const userOnly = await edit(changes, { companyScope: 'user_only' })
    expect(userOnly.status).toBe(200)
    expect(find('user', 'c1').companyName).toBe('SIA Anna')
    expect(find('company', 'co1').companyName).toBe('Anna Example')
  })

  it('applies to a shared company when staff choose it, guarded by the company version', async () => {
    table('user').push(customer({ id: 'c3', email: 'colleague@example.test', cardNumber: '9003', phone: '+37120000003', companyId: 'co1' }))
    const changes = { customerType: 'company', companyName: 'SIA Anna', registrationNumber: '40000000011' }
    const stale = await edit(changes, { companyScope: 'shared_company', expectedCompanyUpdatedAt: T0.toISOString() })
    expect(stale.status).toBe(409)
    expect(await stale.json()).toEqual({ error: 'company_conflict' })
    expect(find('user', 'c1').companyName).toBeNull()

    const shared = await edit(changes, { companyScope: 'shared_company' })
    expect(shared.status).toBe(200)
    expect(find('company', 'co1')).toMatchObject({ companyName: 'SIA Anna', registrationNumber: '40000000011' })
    expect(find('user', 'c3').companyName).toBeNull()
  })
})

describe('GET', () => {
  it('returns the canonical card with company sharing, linked orders and edit history', async () => {
    await edit({ phone: '+37120000005' })
    const response = await get()
    const body = await response.json() as { customer: Record<string, unknown>; canEdit: boolean }
    expect(body.canEdit).toBe(true)
    expect(body.customer).toMatchObject({
      canonical: { firstName: 'Anna', lastName: 'Example', phone: '+37120000005', address: 'Street 1' },
      company: { id: 'co1', otherMembers: 0 },
      linkedOrders: 1,
      savedAddresses: [{ id: 'a1' }],
    })
    expect(body.customer.history).toHaveLength(1)
    expect(JSON.stringify(body)).not.toContain('hash:')
  })
})
