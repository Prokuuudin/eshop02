import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { requireAdminMock, auditMock, h } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  auditMock: vi.fn(),
  // Committed database state; a transaction works on a copy and publishes it only on success.
  h: {
    users: {} as Record<string, { cardNumber: string | null; platformRole: string; teamRole: string | null; superAdmin: boolean; name: string; email: string }>,
    setting: null as { value: unknown; updatedAt: Date } | null,
    sessions: {} as Record<string, number>,
    audits: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: { findUnique: async () => h.setting },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
        where.id.in.filter((id) => h.users[id]).map((id) => ({ id, ...h.users[id] })),
    },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const users = structuredClone(h.users)
      const sessions = { ...h.sessions }
      const audits: Array<Record<string, unknown>> = []
      let setting = h.setting
      const tx = {
        _audits: audits,
        $queryRaw: async (strings: TemplateStringsArray, id: string) =>
          strings.join('?').includes('FROM "User"') && users[id] ? [users[id]] : [],
        keyValueSetting: {
          findUnique: async () => setting,
          upsert: async ({ update }: { update: { value: unknown } }) => { setting = { value: update.value, updatedAt: new Date() } },
        },
        session: {
          deleteMany: async ({ where }: { where: { userId: string } }) => {
            const count = sessions[where.userId] ?? 0
            sessions[where.userId] = 0
            return { count }
          },
        },
      }
      const result = await run(tx)
      Object.assign(h, { users, sessions, setting })
      h.audits.push(...audits)
      return result
    },
  },
}))

import { DELETE, GET, POST } from './route'
import { resetRevokedCardPolicyCache } from '@/lib/revoked-card-policy'
import { buildRevokedCardValue, revokedCardRow } from '@/lib/revoked-card-policy-fixture'

const ADMIN = { id: 'admin-1', platformRole: 'admin', superAdmin: false, email: 'admin@test.com' }
const request = (method: string, body?: unknown) => new NextRequest('https://shop.test/api/admin/revoked-cards', {
  method, body: body === undefined ? undefined : JSON.stringify(body), headers: { origin: 'https://shop.test' },
})
const revoke = (body: unknown) => POST(request('POST', body))
const restore = (body: unknown) => DELETE(request('DELETE', body))
const registryCards = () => (h.setting?.value as { cards: Record<string, Record<string, unknown>> }).cards
const customer = (cardNumber: string | null, extra: Partial<(typeof h.users)[string]> = {}) => ({
  cardNumber, platformRole: 'customer', teamRole: null, superAdmin: false, name: 'Anna Ozola', email: 'anna@example.com', ...extra,
})

beforeEach(() => {
  vi.clearAllMocks()
  resetRevokedCardPolicyCache()
  requireAdminMock.mockResolvedValue(ADMIN)
  auditMock.mockImplementation(async (tx: { _audits: unknown[] }, _req: unknown, actor: { id: string }, input: Record<string, unknown>) => {
    tx._audits.push({ actorId: actor.id, ...input })
  })
  h.users = { u1: customer('4001'), 'admin-1': customer(null, { platformRole: 'admin', name: 'Admin' }) }
  h.setting = revokedCardRow(buildRevokedCardValue())
  h.sessions = { u1: 3 }
  h.audits = []
})

describe('POST /api/admin/revoked-cards (revoke)', () => {
  it('revokes the current card, ends the sessions and audits without the card number', async () => {
    const response = await revoke({ userId: 'u1', cardNumber: '04001', reason: 'Card lost' })

    expect(response.status).toBe(200)
    expect(registryCards()['4001']).toMatchObject({ userId: 'u1', origin: 'admin', revokedBy: 'admin-1', reason: 'Card lost' })
    expect(h.users.u1.cardNumber).toBe('4001')
    expect(h.sessions.u1).toBe(0)
    expect(h.audits).toEqual([expect.objectContaining({
      action: 'card.revoked', entityId: 'u1', details: 'sessionsRevoked=3', reason: 'Card lost',
    })])
    expect(JSON.stringify(h.audits)).not.toContain('4001')
  })

  it.each([
    ['a card the customer no longer holds', { userId: 'u1', cardNumber: '4002', reason: 'Card lost' }, 409, 'card_changed'],
    ['an unknown customer', { userId: 'nobody', cardNumber: '4001', reason: 'Card lost' }, 404, 'not_found'],
    ['a missing reason', { userId: 'u1', cardNumber: '4001', reason: ' ' }, 400, 'invalid_request'],
  ])('refuses %s without writing', async (_label, body, status, error) => {
    const before = JSON.stringify(h.setting)
    const response = await revoke(body)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
    expect(JSON.stringify(h.setting)).toBe(before)
    expect(h.sessions.u1).toBe(3)
  })

  it('refuses a staff account', async () => {
    h.users.u1 = customer('4001', { teamRole: 'manager' })
    const response = await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })
    expect(await response.json()).toEqual({ error: 'staff_account' })
    expect(registryCards()['4001']).toBeUndefined()
  })

  it('reports an already revoked card', async () => {
    h.setting = revokedCardRow(buildRevokedCardValue({ '4001': 'u1' }))
    const response = await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'already_revoked' })
    expect(h.sessions.u1).toBe(3)
  })

  it('is admin-only and checks the request origin', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })).status).toBe(403)
    const foreign = await POST(new NextRequest('https://shop.test/api/admin/revoked-cards', {
      method: 'POST', body: JSON.stringify({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' }), headers: { origin: 'https://evil.test' },
    }))
    expect(foreign.status).toBe(403)
    expect(registryCards()['4001']).toBeUndefined()
  })
})

describe('DELETE /api/admin/revoked-cards (restore)', () => {
  beforeEach(async () => {
    await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })
    resetRevokedCardPolicyCache()
    h.audits = []
  })

  it('restores an admin revocation while the customer still holds the card', async () => {
    const response = await restore({ cardNumber: '4001', reason: 'Found again' })
    expect(response.status).toBe(200)
    expect(registryCards()['4001']).toBeUndefined()
    expect(h.audits).toEqual([expect.objectContaining({ action: 'card.restored', entityId: 'u1', reason: 'Found again' })])
  })

  it('refuses once the customer has another card', async () => {
    h.users.u1.cardNumber = '4002'
    const response = await restore({ cardNumber: '4001', reason: 'Found again' })
    expect(await response.json()).toEqual({ error: 'card_reassigned' })
    expect(registryCards()['4001']).toBeDefined()
  })

  it('refuses a card from the 2026-11-16 batch', async () => {
    const response = await restore({ cardNumber: '900001', reason: 'Found again' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'not_restorable' })
  })
})

describe('GET /api/admin/revoked-cards', () => {
  it('lists admin revocations with names and the batch size', async () => {
    await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })
    resetRevokedCardPolicyCache()

    const response = await GET()
    expect(await response.json()).toEqual({
      batchCount: 905,
      cards: [expect.objectContaining({
        cardNumber: '4001', userId: 'u1', customerName: 'Anna Ozola', customerEmail: 'anna@example.com',
        restorable: true, revokedByName: 'Admin', reason: 'Card lost',
      })],
    })
  })
})
