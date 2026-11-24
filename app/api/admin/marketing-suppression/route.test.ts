import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Committed state; a transaction works on a copy and publishes it only on success, so a
// failed audit leaves neither the block nor its event behind.
const h = vi.hoisted(() => ({
  users: {} as Record<string, { email: string; platformRole: string }>,
  kv: {} as Record<string, unknown>,
  audits: [] as Array<Record<string, unknown>>,
  requireAdmin: vi.fn(),
  requireAdminPermission: vi.fn(),
  appendServerAudit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn(), logOperationalEvent: vi.fn() }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: h.requireAdmin, requireAdminPermission: h.requireAdminPermission }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/prisma', () => {
  const kvClient = (kv: Record<string, unknown>) => ({
    findUnique: async ({ where }: { where: { key: string } }) => (where.key in kv ? { key: where.key, value: structuredClone(kv[where.key]) } : null),
    findMany: async ({ where }: { where: { key: { in: string[] } } }) =>
      where.key.in.filter((key) => key in kv).map((key) => ({ key, value: structuredClone(kv[key]) })),
    upsert: async ({ where, create }: { where: { key: string }; create: { key: string; value: unknown } }) => {
      if (!(where.key in kv)) kv[create.key] = structuredClone(create.value)
    },
    deleteMany: async ({ where }: { where: { key: string } }) => {
      const had = where.key in kv
      delete kv[where.key]
      return { count: had ? 1 : 0 }
    },
  })
  return {
    prisma: {
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const kv = structuredClone(h.kv)
        const audits: Array<Record<string, unknown>> = []
        const tx = {
          _audits: audits,
          $queryRaw: async (strings: TemplateStringsArray, id: string) =>
            strings.join('?').includes('FROM "User"') && h.users[id] ? [{ ...h.users[id] }] : [],
          keyValueSetting: kvClient(kv),
        }
        const result = await run(tx)
        h.kv = kv
        h.audits.push(...audits)
        return result
      },
    },
  }
})

import { DELETE, POST } from './route'

const ADMIN = { id: 'admin-1', email: 'admin@shop.lv', name: 'Anna Admin', platformRole: 'admin' }
const MANAGER = { id: 'mgr-1', email: 'mgr@shop.lv', name: 'Maris Manager', platformRole: 'customer', teamRole: 'manager' }
const KEY = 'marketing:optout:client@example.lv'

function call(method: 'POST' | 'DELETE', body: unknown, origin = 'https://shop.test'): Promise<Response> {
  const req = new NextRequest('https://shop.test/api/admin/marketing-suppression', {
    method,
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify(body),
  })
  return method === 'POST' ? POST(req) : DELETE(req)
}

beforeEach(() => {
  vi.clearAllMocks()
  h.users = {
    c1: { email: 'Client@Example.LV', platformRole: 'customer' },
    staff: { email: 'staff@shop.lv', platformRole: 'admin' },
  }
  h.kv = {}
  h.audits = []
  h.appendServerAudit.mockImplementation(async (tx: { _audits: unknown[] }, _req: unknown, actor: { id: string }, input: Record<string, unknown>) => {
    tx._audits.push({ actorId: actor.id, ...input })
  })
  h.requireAdminPermission.mockResolvedValue(ADMIN)
  h.requireAdmin.mockResolvedValue(ADMIN)
})

describe('POST /api/admin/marketing-suppression — set the block', () => {
  it('stores date, administrator and optional reason on the normalized email, audited in the same transaction', async () => {
    const res = await call('POST', { userId: 'c1', reason: '  asked by phone  ' })
    expect(res.status).toBe(200)
    expect(h.requireAdminPermission).toHaveBeenCalledWith('customers.read')
    expect(h.kv[KEY]).toMatchObject({ email: 'client@example.lv', source: 'admin', setByUserId: 'admin-1', setByName: 'Anna Admin', reason: 'asked by phone' })
    expect(Date.parse((h.kv[KEY] as { optedOutAt: string }).optedOutAt)).not.toBeNaN()
    expect(h.audits).toEqual([{
      actorId: 'admin-1', action: 'marketing.suppression_set', entityType: 'user', entityId: 'c1',
      before: { marketingSuppressed: false }, after: { marketingSuppressed: true, source: 'admin' }, reason: 'asked by phone',
    }])
    // Internal id only: no address in the audit row.
    expect(JSON.stringify(h.audits)).not.toMatch(/example\.lv/iu)
  })

  it('works without a reason', async () => {
    expect((await call('POST', { userId: 'c1' })).status).toBe(200)
    expect(h.kv[KEY]).toMatchObject({ reason: null })
    expect(h.audits[0]).toMatchObject({ reason: null })
  })

  it('lets a manager block a customer, but not a staff account', async () => {
    h.requireAdminPermission.mockResolvedValue(MANAGER)
    expect((await call('POST', { userId: 'c1' })).status).toBe(200)
    expect(h.kv[KEY]).toMatchObject({ setByUserId: 'mgr-1' })
    const staff = await call('POST', { userId: 'staff' })
    expect(staff.status).toBe(403)
    expect(await staff.json()).toEqual({ error: 'forbidden' })
    expect(h.kv['marketing:optout:staff@shop.lv']).toBeUndefined()
  })

  it.each([
    ['a company owner (teamRole admin) on a customer account', { id: 'own-1', email: 'owner@salon.lv', platformRole: 'customer', teamRole: 'admin' }],
    ['a buyer', { id: 'buy-1', email: 'buyer@salon.lv', platformRole: 'customer', teamRole: 'buyer' }],
    ['a plain customer', { id: 'cus-1', email: 'c@salon.lv', platformRole: 'customer' }],
  ])('refuses %s even if a customers.read permission were granted', async (_label, caller) => {
    h.requireAdminPermission.mockResolvedValue(caller)
    const res = await call('POST', { userId: 'c1' })
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'forbidden' })
    expect(h.kv).toEqual({})
    expect(h.audits).toEqual([])
  })

  it('lets a Super Admin set the block', async () => {
    h.requireAdminPermission.mockResolvedValue({ ...ADMIN, id: 'sa-1', superAdmin: true })
    expect((await call('POST', { userId: 'c1' })).status).toBe(200)
  })

  it('rejects callers without customer access before reading anything', async () => {
    h.requireAdminPermission.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await call('POST', { userId: 'c1' })).status).toBe(403)
    expect(h.kv).toEqual({})
    expect(h.audits).toEqual([])
  })

  it('rejects a cross-site request (CSRF origin check)', async () => {
    expect((await call('POST', { userId: 'c1' }, 'https://evil.test')).status).toBe(403)
    expect(h.kv).toEqual({})
  })

  it('answers 409 when the block already exists and keeps the original entry', async () => {
    h.kv[KEY] = { email: 'client@example.lv', optedOutAt: '2026-10-01T00:00:00.000Z', source: 'self_service' }
    const res = await call('POST', { userId: 'c1', reason: 'again' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'already_suppressed' })
    expect(h.kv[KEY]).toMatchObject({ source: 'self_service' })
    expect(h.audits).toEqual([])
  })

  it('writes nothing when the audit fails', async () => {
    h.appendServerAudit.mockRejectedValue(new Error('audit down'))
    expect((await call('POST', { userId: 'c1' })).status).toBe(500)
    expect(h.kv).toEqual({})
  })

  it('validates the input', async () => {
    expect((await call('POST', {})).status).toBe(400)
    expect((await call('POST', { userId: 'c1', reason: 'x'.repeat(501) })).status).toBe(400)
    expect((await call('POST', { userId: 'c1', extra: true })).status).toBe(400)
    expect((await call('POST', { userId: 'missing' })).status).toBe(404)
  })
})

describe('DELETE /api/admin/marketing-suppression — lift the block', () => {
  beforeEach(() => {
    h.kv[KEY] = { email: 'client@example.lv', optedOutAt: '2026-11-01T00:00:00.000Z', source: 'admin', setByName: 'Anna Admin', reason: 'asked' }
  })

  it('requires a confirmed and described new consent', async () => {
    for (const body of [
      { userId: 'c1' },
      { userId: 'c1', consentConfirmed: false, consentNote: 'signed form 2026-11-24' },
      { userId: 'c1', consentConfirmed: true },
      { userId: 'c1', consentConfirmed: true, consentNote: '  ' },
    ]) {
      const res = await call('DELETE', body)
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'consent_confirmation_required' })
    }
    expect(h.kv[KEY]).toBeDefined()
    expect(h.audits).toEqual([])
  })

  it('lifts the block and records the consent note as the audit reason', async () => {
    const res = await call('DELETE', { userId: 'c1', consentConfirmed: true, consentNote: 'Signed consent form, 24.11.2026' })
    expect(res.status).toBe(200)
    expect(h.requireAdmin).toHaveBeenCalled()
    expect(h.kv[KEY]).toBeUndefined()
    expect(h.audits).toEqual([{
      actorId: 'admin-1', action: 'marketing.suppression_lifted', entityType: 'user', entityId: 'c1',
      before: { marketingSuppressed: true, source: 'admin', since: '2026-11-01T00:00:00.000Z' },
      after: { marketingSuppressed: false, newConsentConfirmed: true },
      reason: 'Signed consent form, 24.11.2026',
    }])
  })

  it('never lifts a GDPR-erasure entry from the client card, even with consent', async () => {
    h.kv[KEY] = { email: 'client@example.lv', optedOutAt: '2026-11-01T00:00:00.000Z', source: 'erasure' }
    const res = await call('DELETE', { userId: 'c1', consentConfirmed: true, consentNote: 'Signed consent form' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'erasure_protected' })
    expect(h.kv[KEY]).toMatchObject({ source: 'erasure' })
    expect(h.audits).toEqual([])
  })

  it('refuses a lift by a non-admin even if users.manage were granted', async () => {
    h.requireAdmin.mockResolvedValue(MANAGER)
    expect((await call('DELETE', { userId: 'c1', consentConfirmed: true, consentNote: 'phone call' })).status).toBe(403)
    expect(h.kv[KEY]).toBeDefined()
  })

  it('is admin-only: a manager cannot lift it', async () => {
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await call('DELETE', { userId: 'c1', consentConfirmed: true, consentNote: 'phone call' })).status).toBe(403)
    expect(h.kv[KEY]).toBeDefined()
  })

  it('answers 409 when there is no block', async () => {
    delete h.kv[KEY]
    const res = await call('DELETE', { userId: 'c1', consentConfirmed: true, consentNote: 'phone call' })
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'not_suppressed' })
  })

  it('rejects a cross-site request (CSRF origin check)', async () => {
    expect((await call('DELETE', { userId: 'c1', consentConfirmed: true, consentNote: 'phone call' }, 'https://evil.test')).status).toBe(403)
    expect(h.kv[KEY]).toBeDefined()
  })
})
