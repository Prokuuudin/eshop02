import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { requireAdminMock, auditMock, h } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  auditMock: vi.fn(),
  // Committed database state; a transaction works on a copy and publishes it only on success.
  h: {
    users: {} as Record<string, { cardNumber: string | null; platformRole: string; teamRole: string | null; superAdmin: boolean; name: string; email: string; bonusPoints: number }>,
    settings: {} as Record<string, unknown>,
    sessions: {} as Record<string, number>,
    tokens: [] as Array<{ id: string; userId: string; cardNumber: string; status: string }>,
    audits: [] as Array<Record<string, unknown>>,
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => {
  const setting = (settings: Record<string, unknown>) => async ({ where }: { where: { key: string } }) =>
    (where.key in settings ? { value: structuredClone(settings[where.key]), updatedAt: new Date('2026-11-16T10:00:00Z') } : null)
  return {
    prisma: {
      keyValueSetting: { findUnique: (args: { where: { key: string } }) => setting(h.settings)(args) },
      user: {
        findMany: async ({ where }: { where: { id: { in: string[] } } }) =>
          where.id.in.filter((id) => h.users[id]).map((id) => ({ id, ...h.users[id] })),
      },
      $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
        const users = structuredClone(h.users)
        const settings = structuredClone(h.settings)
        const sessions = { ...h.sessions }
        let tokens = structuredClone(h.tokens)
        const audits: Array<Record<string, unknown>> = []
        const tx = {
          _audits: audits,
          $queryRaw: async (strings: TemplateStringsArray, id: string) =>
            strings.join('?').includes('FROM "User"') && users[id] ? [{ ...users[id] }] : [],
          $executeRaw: async () => 1,
          keyValueSetting: {
            findUnique: (args: { where: { key: string } }) => setting(settings)(args),
            upsert: async ({ where, update }: { where: { key: string }; update: { value: unknown } }) => { settings[where.key] = structuredClone(update.value) },
          },
          user: {
            update: async ({ where, data }: { where: { id: string }; data: { cardNumber: string | null } }) => {
              if (data.cardNumber && Object.entries(users).some(([id, u]) => id !== where.id && u.cardNumber === data.cardNumber)) {
                throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' })
              }
              users[where.id].cardNumber = data.cardNumber
            },
          },
          session: {
            deleteMany: async ({ where }: { where: { userId: string } }) => {
              const count = sessions[where.userId] ?? 0
              sessions[where.userId] = 0
              return { count }
            },
          },
          invitationToken: {
            deleteMany: async ({ where }: { where: { status: { not: string }; OR: Array<{ userId?: string; cardNumber?: string }> } }) => {
              const before = tokens.length
              tokens = tokens.filter((t) => t.status === where.status.not || !where.OR.some((c) => t.userId === c.userId || t.cardNumber === c.cardNumber))
              return { count: before - tokens.length }
            },
          },
        }
        const result = await run(tx)
        Object.assign(h, { users, settings, sessions, tokens })
        h.audits.push(...audits)
        return result
      },
    },
  }
})

import { DELETE, GET, POST } from './route'
import { resetRevokedCardPolicyCache } from '@/lib/revoked-card-policy'
import { buildRevokedCardValue } from '@/lib/revoked-card-policy-fixture'

const BATCH_KEY = 'revoked-client-cards:v1'
const ADMIN_KEY = 'revoked-client-cards:admin:v1'
const ADMIN = { id: 'admin-1', platformRole: 'admin', superAdmin: false, email: 'admin@test.com' }
const request = (method: string, body?: unknown) => new NextRequest('https://shop.test/api/admin/revoked-cards', {
  method, body: body === undefined ? undefined : JSON.stringify(body), headers: { origin: 'https://shop.test' },
})
const revoke = (body: unknown) => POST(request('POST', body))
const restore = (body: unknown) => DELETE(request('DELETE', body))
const adminCards = () => ((h.settings[ADMIN_KEY] as { cards?: Record<string, Record<string, unknown>> } | undefined)?.cards ?? {})
const customer = (cardNumber: string | null, extra: Partial<(typeof h.users)[string]> = {}) => ({
  cardNumber, platformRole: 'customer', teamRole: null, superAdmin: false, name: 'Anna Ozola', email: 'anna@example.com', bonusPoints: 1234, ...extra,
})
const BATCH = buildRevokedCardValue()

beforeEach(() => {
  vi.clearAllMocks()
  resetRevokedCardPolicyCache()
  requireAdminMock.mockResolvedValue(ADMIN)
  auditMock.mockImplementation(async (tx: { _audits: unknown[] }, _req: unknown, actor: { id: string }, input: Record<string, unknown>) => {
    tx._audits.push({ actorId: actor.id, ...input })
  })
  h.users = { u1: customer('4001'), u2: customer('4002', { name: 'Boris', email: 'boris@example.com' }), 'admin-1': customer(null, { platformRole: 'admin', name: 'Admin' }) }
  h.settings = { [BATCH_KEY]: structuredClone(BATCH) }
  h.sessions = { u1: 3 }
  h.tokens = [
    { id: 't-own', userId: 'u1', cardNumber: '4001', status: 'sent' },
    { id: 't-card', userId: 'u9', cardNumber: '4001', status: 'error' },
    { id: 't-done', userId: 'u1', cardNumber: '4001', status: 'accepted' },
    { id: 't-other', userId: 'u2', cardNumber: '4002', status: 'sent' },
  ]
  h.audits = []
})

describe('POST /api/admin/revoked-cards (revoke)', () => {
  it('detaches the card, records it, voids open invitations, ends sessions and audits without the number', async () => {
    const response = await revoke({ userId: 'u1', cardNumber: '04001', reason: 'Card lost' })

    expect(response.status).toBe(200)
    expect(h.users.u1).toEqual(customer(null))
    expect(adminCards()['4001']).toEqual({ userId: 'u1', revokedAt: expect.any(String), revokedBy: 'admin-1', reason: 'Card lost' })
    expect(h.tokens.map((t) => t.id)).toEqual(['t-done', 't-other'])
    expect(h.sessions.u1).toBe(0)
    expect(h.audits).toEqual([expect.objectContaining({
      action: 'card.revoked', entityId: 'u1', details: 'sessionsRevoked=3; invitationsRevoked=2', reason: 'Card lost',
    })])
    expect(JSON.stringify(h.audits)).not.toContain('4001')
  })

  it('never writes the 2026-11-16 batch row', async () => {
    await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })
    expect(h.settings[BATCH_KEY]).toEqual(BATCH)
  })

  it.each([
    ['a card the customer no longer holds', { userId: 'u1', cardNumber: '4002', reason: 'Card lost' }, 409, 'card_changed'],
    ['an unknown customer', { userId: 'nobody', cardNumber: '4001', reason: 'Card lost' }, 404, 'not_found'],
    ['a missing reason', { userId: 'u1', cardNumber: '4001', reason: ' ' }, 400, 'invalid_request'],
  ])('refuses %s without writing', async (_label, body, status, error) => {
    const before = JSON.stringify(h)
    const response = await revoke(body)
    expect(response.status).toBe(status)
    expect(await response.json()).toEqual({ error })
    expect(JSON.stringify(h)).toBe(before)
  })

  it('refuses a protected number (111/5044) without writing', async () => {
    h.users.u1 = customer('111')
    const response = await revoke({ userId: 'u1', cardNumber: '111', reason: 'Card lost' })
    expect(await response.json()).toEqual({ error: 'card_protected' })
    expect(h.users.u1.cardNumber).toBe('111')
    expect(h.settings[ADMIN_KEY]).toBeUndefined()
  })

  it('refuses a staff account', async () => {
    h.users.u1 = customer('4001', { teamRole: 'manager' })
    const response = await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })
    expect(await response.json()).toEqual({ error: 'staff_account' })
    expect(h.users.u1.cardNumber).toBe('4001')
  })

  it('reports a card already revoked in the batch and changes nothing', async () => {
    h.settings[BATCH_KEY] = buildRevokedCardValue({ '4001': 'u1' })
    const response = await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'already_revoked' })
    expect(h.users.u1.cardNumber).toBe('4001')
    expect(h.sessions.u1).toBe(3)
    expect(h.settings[ADMIN_KEY]).toBeUndefined()
  })

  it('is admin-only and checks the request origin', async () => {
    requireAdminMock.mockResolvedValueOnce(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })).status).toBe(403)
    const foreign = await POST(new NextRequest('https://shop.test/api/admin/revoked-cards', {
      method: 'POST', body: JSON.stringify({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' }), headers: { origin: 'https://evil.test' },
    }))
    expect(foreign.status).toBe(403)
    expect(h.users.u1.cardNumber).toBe('4001')
  })
})

describe('DELETE /api/admin/revoked-cards (restore)', () => {
  beforeEach(async () => {
    await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })
    h.audits = []
  })

  it('gives the card back to its customer and drops the revocation', async () => {
    const response = await restore({ cardNumber: '4001', reason: 'Found again' })
    expect(response.status).toBe(200)
    expect(h.users.u1.cardNumber).toBe('4001')
    expect(adminCards()['4001']).toBeUndefined()
    expect(h.audits).toEqual([expect.objectContaining({ action: 'card.restored', entityId: 'u1', reason: 'Found again' })])
  })

  it('refuses once the customer has another card', async () => {
    h.users.u1.cardNumber = '4005'
    const response = await restore({ cardNumber: '4001', reason: 'Found again' })
    expect(await response.json()).toEqual({ error: 'card_reassigned' })
    expect(adminCards()['4001']).toBeDefined()
  })

  it('refuses when someone else holds the number and keeps the revocation', async () => {
    h.users.u2.cardNumber = '4001'
    const response = await restore({ cardNumber: '4001', reason: 'Found again' })
    expect(await response.json()).toEqual({ error: 'card_taken' })
    expect(adminCards()['4001']).toBeDefined()
    expect(h.users.u1.cardNumber).toBeNull()
  })

  it('refuses a card from the 2026-11-16 batch', async () => {
    const response = await restore({ cardNumber: '900001', reason: 'Found again' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'not_restorable' })
    expect(h.settings[BATCH_KEY]).toEqual(BATCH)
  })
})

describe('GET /api/admin/revoked-cards', () => {
  it('lists admin revocations with names and the batch size', async () => {
    await revoke({ userId: 'u1', cardNumber: '4001', reason: 'Card lost' })

    const response = await GET()
    expect(await response.json()).toEqual({
      batchCount: 905,
      cards: [expect.objectContaining({
        cardNumber: '4001', userId: 'u1', customerName: 'Anna Ozola', customerEmail: 'anna@example.com',
        restorable: true, revokedByName: 'Admin', reason: 'Card lost',
      })],
    })
  })

  it('fails closed (503) on a corrupt admin registry', async () => {
    h.settings[ADMIN_KEY] = { cards: { '4001': { userId: 'u1' } } }
    const response = await GET()
    expect(response.status).toBe(503)
  })
})
