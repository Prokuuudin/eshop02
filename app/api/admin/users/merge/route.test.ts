import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { requireAdminMock, auditMock, transactionMock, db } = vi.hoisted(() => ({
  requireAdminMock: vi.fn(),
  auditMock: vi.fn(),
  transactionMock: vi.fn(),
  db: { current: null as unknown },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: requireAdminMock }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: new Proxy({}, {
    get: (_target, key) => (key === '$transaction' ? transactionMock : (db.current as Record<string | symbol, unknown>)[key]),
  }),
}))

import { GET, POST } from './route'
import { resetRevokedCardPolicyCache } from '@/lib/revoked-card-policy'
import { CARD_ID, LEGACY_ID, createState, fakeTx, type FakeState } from '@/tests/helpers/account-merge-db'

const ADMIN = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin', superAdmin: false }
let state: FakeState

const get = (query: string) => GET(new NextRequest(`https://shop.test/api/admin/users/merge${query}`))
const post = (body: unknown, origin = 'https://shop.test') => POST(new NextRequest('https://shop.test/api/admin/users/merge', {
  method: 'POST', body: JSON.stringify(body), headers: { origin },
}))
const mergeBody = (fields: Record<string, unknown> = {}) => ({
  sourceId: LEGACY_ID,
  targetId: CARD_ID,
  sourceUpdatedAt: '2024-05-01T09:00:00.000Z',
  targetUpdatedAt: '2026-09-01T12:00:00.000Z',
  reason: 'Same person: phone on the old order matches the card',
  confirmed: true,
  ...fields,
})

beforeEach(() => {
  vi.clearAllMocks()
  resetRevokedCardPolicyCache()
  state = createState()
  db.current = fakeTx(state)
  requireAdminMock.mockResolvedValue(ADMIN)
  transactionMock.mockImplementation(async (run: (tx: unknown) => Promise<unknown>) => run(fakeTx(state)))
})

describe('GET /api/admin/users/merge (preview)', () => {
  it('is admin-only', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await get(`?sourceId=${LEGACY_ID}&targetId=${CARD_ID}`)).status).toBe(403)
  })

  it('needs both ids', async () => {
    expect((await get(`?sourceId=${LEGACY_ID}`)).status).toBe(400)
  })

  it('returns the preview and changes nothing', async () => {
    const response = await get(`?sourceId=${LEGACY_ID}&targetId=${CARD_ID}`)
    expect(response.status).toBe(200)
    const { preview } = await response.json()
    expect(preview).toMatchObject({ source: { id: LEGACY_ID }, target: { cardNumber: '4242' }, blockers: [] })
    expect(state.users[LEGACY_ID]).toBeDefined()
    expect(transactionMock).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/users/merge', () => {
  it('rejects a foreign origin before reading anything', async () => {
    const response = await post(mergeBody(), 'https://evil.test')
    expect(response.status).toBe(403)
    expect(requireAdminMock).not.toHaveBeenCalled()
    expect(state.users[LEGACY_ID]).toBeDefined()
  })

  it('is admin-only', async () => {
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post(mergeBody())).status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it.each([
    ['without the confirmation', { confirmed: undefined }],
    ['with confirmed=false', { confirmed: false }],
    ['without a reason', { reason: '  ok ' }],
    ['with unknown fields', { force: true }],
  ])('refuses a request %s', async (_label, fields) => {
    expect((await post(mergeBody(fields))).status).toBe(400)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('merges in one serializable transaction and audits it without secrets', async () => {
    const response = await post(mergeBody())
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ alreadyMerged: false, email: 'anna@example.com', moved: { 'Order.userId': 1 } })
    expect(transactionMock).toHaveBeenCalledWith(expect.any(Function), expect.objectContaining({ isolationLevel: 'Serializable' }))
    expect(state.users[CARD_ID].email).toBe('anna@example.com')
    expect(auditMock).toHaveBeenCalledTimes(1)
    const [, , actor, entry] = auditMock.mock.calls[0]
    expect(actor).toBe(ADMIN)
    expect(entry).toMatchObject({
      action: 'user.accounts_merged', entityType: 'user', entityId: CARD_ID,
      reason: 'Same person: phone on the old order matches the card',
      before: { sourceId: LEGACY_ID, targetEmail: 'card.4242@client.local' },
    })
    expect(JSON.stringify(entry)).not.toMatch(/secret|passwordHash|pkLast3|mfa/u)
  })

  it('a repeated request is answered as already merged and audited once', async () => {
    expect((await post(mergeBody())).status).toBe(200)
    const again = await post(mergeBody())
    expect(again.status).toBe(200)
    expect(await again.json()).toEqual({ alreadyMerged: true, targetId: CARD_ID })
    expect(auditMock).toHaveBeenCalledTimes(1)
  })

  it('reports the blockers and writes nothing for an activated legacy account', async () => {
    state.users[LEGACY_ID].privacyAcknowledgedAt = new Date('2026-10-30T10:00:00.000Z')
    const response = await post(mergeBody())
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'blocked', blockers: ['source_activated'] })
    expect(state.users[LEGACY_ID]).toBeDefined()
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('refuses a stale preview', async () => {
    const response = await post(mergeBody({ targetUpdatedAt: '2026-11-20T00:00:00.000Z' }))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'optimistic_conflict' })
  })

  it('maps a serialization failure to concurrent_update', async () => {
    transactionMock.mockRejectedValueOnce(Object.assign(new Error('could not serialize'), { code: 'P2034' }))
    const response = await post(mergeBody())
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'concurrent_update' })
  })

  it('fails closed when the revoked-card registry is unreadable', async () => {
    state.settings['revoked-client-cards:v1'] = { active: true }
    const response = await post(mergeBody())
    expect(response.status).toBe(503)
    expect(state.users[LEGACY_ID]).toBeDefined()
  })
})
