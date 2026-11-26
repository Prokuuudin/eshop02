import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const h = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  audit: vi.fn(),
  actor: { id: 'admin-1', email: 'admin@test.lv', name: 'Admin', platformRole: 'admin', teamRole: null, superAdmin: false },
}))

function keyValueSetting() {
  return {
    findUnique: vi.fn(async ({ where }: { where: { key: string } }) => h.rows.has(where.key) ? { key: where.key, value: h.rows.get(where.key) } : null),
    findMany: vi.fn(async ({ where }: { where: { key: { in: string[] } } }) => where.key.in.filter((key) => h.rows.has(key)).map((key) => ({ key, value: h.rows.get(key) }))),
    upsert: vi.fn(async ({ where, create }: { where: { key: string }; create: { key: string; value: unknown } }) => {
      if (!h.rows.has(where.key)) h.rows.set(create.key, create.value)
      return { key: where.key }
    }),
    deleteMany: vi.fn(async ({ where }: { where: { key: string } }) => ({ count: h.rows.delete(where.key) ? 1 : 0 })),
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/api-guard', () => ({ guardOrigin: vi.fn(() => null) }))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({
  requireAdmin: vi.fn(async () => h.actor),
  requireAdminPermission: vi.fn(async () => h.actor),
}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.audit }))
vi.mock('@/lib/prisma', () => {
  const tx = { keyValueSetting: keyValueSetting(), $queryRaw: vi.fn(async () => [{ platformRole: 'customer' }]) }
  return { prisma: { ...tx, $transaction: vi.fn(async (run: (client: typeof tx) => Promise<unknown>) => run(tx)) } }
})

import { DELETE, POST } from './route'

function request(method: 'POST' | 'DELETE', reason = 'Client asked by phone'): NextRequest {
  return new NextRequest('https://shop.test/api/admin/invitation-suppression', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'user-1', reason }),
  })
}

beforeEach(() => {
  h.rows.clear()
  h.audit.mockReset()
})

describe('admin invitation-only suppression', () => {
  it('sets the restriction with a reason and an audit entry', async () => {
    const response = await POST(request('POST'))

    expect(response.status).toBe(200)
    expect(h.rows.has('invitation:optout:user:user-1')).toBe(true)
    expect(h.audit).toHaveBeenCalledWith(expect.anything(), expect.anything(), h.actor, expect.objectContaining({
      action: 'invitation.suppression_set',
      entityId: 'user-1',
      reason: 'Client asked by phone',
    }))
  })

  it('lifts only the invitation restriction and keeps the full mailing block', async () => {
    h.rows.set('invitation:optout:user:user-1', { optedOutAt: '2026-11-26T10:00:00.000Z', source: 'client_link' })
    h.rows.set('marketing:optout:client@example.lv', { source: 'admin' })

    const response = await DELETE(request('DELETE', 'Client requested invitations again'))

    expect(response.status).toBe(200)
    expect(h.rows.has('invitation:optout:user:user-1')).toBe(false)
    expect(h.rows.has('marketing:optout:client@example.lv')).toBe(true)
    expect(h.audit).toHaveBeenCalledWith(expect.anything(), expect.anything(), h.actor, expect.objectContaining({
      action: 'invitation.suppression_lifted',
      reason: 'Client requested invitations again',
    }))
  })

  it('requires a documented reason', async () => {
    expect((await POST(request('POST', 'x'))).status).toBe(400)
    expect(h.rows.size).toBe(0)
  })
})
