import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { userFindFirstMock, userUpdateMock, userCreateMock, hashPasswordMock, requireAdminMock, appendServerAuditMock, h } = vi.hoisted(() => ({
  userFindFirstMock: vi.fn(),
  userUpdateMock: vi.fn(),
  userCreateMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  requireAdminMock: vi.fn(),
  appendServerAuditMock: vi.fn(),
  // Committed state of the transaction harness: writes and audit rows publish
  // only when the callback resolves; transactions run one at a time (row lock).
  h: {
    cards: {} as Record<string, string | null>,
    committed: [] as string[],
    audits: [] as Array<Record<string, unknown>>,
    queue: Promise.resolve() as Promise<unknown>,
  },
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: appendServerAuditMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: userFindFirstMock },
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const previous = h.queue
      let release = (): void => undefined
      h.queue = new Promise<void>((resolve) => { release = resolve })
      await previous
      try {
        const writes: string[] = []
        const audits: Array<Record<string, unknown>> = []
        const cards: Record<string, string | null> = { ...h.cards }
        const tx = {
          _audits: audits,
          $queryRaw: async (_strings: TemplateStringsArray, id: string) => (id in cards ? [{ cardNumber: cards[id] }] : []),
          user: {
            update: async (args: { where: { id: string }; data: { cardNumber: string } }) => {
              writes.push('update'); cards[args.where.id] = args.data.cardNumber; return userUpdateMock(args)
            },
            create: async (args: { data: { id: string; cardNumber: string } }) => {
              writes.push('create'); cards[args.data.id] = args.data.cardNumber; return userCreateMock(args)
            },
          },
        }
        const result = await run(tx)
        h.cards = cards
        h.committed.push(...writes)
        h.audits.push(...audits)
        return result
      } finally {
        release()
      }
    },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock,
  requireAdmin: requireAdminMock,
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/invitations/card', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@hairshoppro.lv' })
  hashPasswordMock.mockResolvedValue('hashed')
  userFindFirstMock.mockResolvedValue(null)
  userCreateMock.mockImplementation(async ({ data }) => ({ id: data.id }))
  userUpdateMock.mockImplementation(async ({ where }) => ({ id: where.id }))
  h.cards = { 'user-1': null }
  h.committed = []
  h.audits = []
  h.queue = Promise.resolve()
  appendServerAuditMock.mockImplementation(async (tx: { _audits: Array<Record<string, unknown>> }, _req: NextRequest, actor: { id: string }, input: Record<string, unknown>) => {
    tx._audits.push({ actorId: actor.id, ...input })
  })
})

describe('POST /api/admin/invitations/card', () => {
  it('assigns a card to an already-registered client without touching name/phone', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'user-1' })
    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1001', phone: '+37120000000' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, userId: 'user-1', created: false })
    expect(userUpdateMock).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { cardNumber: '1001' } })
    expect(userCreateMock).not.toHaveBeenCalled()
  })

  it('creates a sleeping account for a brand-new client with email, phone and card', async () => {
    const res = await POST(makeRequest({ email: 'New@Client.lv', cardNumber: '01002', name: 'Anna', phone: '+37120000001' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, userId: expect.any(String), created: true })
    const createArgs = userCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(createArgs.data.email).toBe('new@client.lv')
    expect(createArgs.data.cardNumber).toBe('1002')
    expect(createArgs.data.phone).toBe('+37120000001')
    expect(createArgs.data.name).toBe('Anna')
    expect(createArgs.data.mustChangePassword).toBe(true)
    expect(createArgs.data.platformRole).toBe('customer')
    expect(hashPasswordMock).toHaveBeenCalled()
  })

  it('rejects a new client without a phone (activation data is mandatory)', async () => {
    const res = await POST(makeRequest({ email: 'nophone@client.lv', cardNumber: '1003' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('phone_required')
    expect(userCreateMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid card number', async () => {
    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: 'abc123456789', phone: '+37120000000' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_card')
  })

  it('maps a unique-constraint conflict on card number to 409', async () => {
    userCreateMock.mockRejectedValueOnce({ code: 'P2002' })
    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1004', phone: '+37120000000' }))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('card_taken')
  })

  it('rejects unauthenticated/non-admin callers', async () => {
    const { NextResponse } = await import('next/server')
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1005', phone: '+37120000000' }))

    expect(res.status).toBe(403)
    expect(userFindFirstMock).not.toHaveBeenCalled()
  })

  it.each([
    ['platform admin', { platformRole: 'admin', teamRole: null, superAdmin: false }],
    ['Super Admin', { platformRole: 'admin', teamRole: null, superAdmin: true }],
    ['staff manager', { platformRole: 'customer', teamRole: 'manager', superAdmin: false }],
  ])('refuses to attach a card to a %s account', async (_label, roles) => {
    userFindFirstMock.mockResolvedValue({ id: 'staff-1', ...roles })
    const res = await POST(makeRequest({ email: 'staff@miksplus.eu', cardNumber: '1001', phone: '+37120000000' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: 'staff_account' })
    expect(userUpdateMock).not.toHaveBeenCalled()
    expect(userCreateMock).not.toHaveBeenCalled()
  })

  it('audits a card assigned to an existing client with flags only', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'user-1' })
    await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1001', phone: '+37120000000' }))

    expect(h.audits).toEqual([{
      actorId: 'admin-1', action: 'invitation.card_assigned', entityType: 'user', entityId: 'user-1',
      before: { hasCard: false }, after: { hasCard: true, cardChanged: false, accountCreated: false },
    }])
  })

  it('audits a created sleeping account without email, phone, name or card number', async () => {
    const res = await POST(makeRequest({ email: 'New@Client.lv', cardNumber: '01002', name: 'Anna', phone: '+37120000001' }))
    const { userId } = await res.json()

    expect(h.audits).toEqual([{
      actorId: 'admin-1', action: 'invitation.card_assigned', entityType: 'user', entityId: userId,
      before: null, after: { hasCard: true, cardChanged: false, accountCreated: true },
    }])
    const serialized = JSON.stringify(h.audits)
    for (const secret of ['client.lv', 'Anna', '+3712', '1002']) expect(serialized).not.toContain(secret)
  })

  it('treats a repeat of the same card for the same client as a no-op', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'user-1' })
    h.cards['user-1'] = '1001'

    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '01001' }))

    expect(await res.json()).toEqual({ ok: true, userId: 'user-1', created: false })
    expect(userUpdateMock).not.toHaveBeenCalled()
    expect(h.audits).toHaveLength(0)
  })

  it('records a card change on an existing client', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'user-1' })
    h.cards['user-1'] = '1000'

    await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1001' }))

    expect(h.audits[0]).toMatchObject({ before: { hasCard: true }, after: { cardChanged: true } })
  })

  it('applies two concurrent identical assignments once', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'user-1' })

    const responses = await Promise.all([
      POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1001' })),
      POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1001' })),
    ])

    expect(responses.map((r) => r.status)).toEqual([200, 200])
    expect(h.committed).toEqual(['update'])
    expect(h.audits).toHaveLength(1)
  })

  it('rolls back the card assignment when the audit append fails', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'user-1' })
    appendServerAuditMock.mockRejectedValueOnce(new Error('audit unavailable'))

    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1001' }))

    expect(res.status).toBe(500)
    expect(h.committed).toEqual([])
    expect(h.cards['user-1']).toBeNull()
  })

  it('rolls back a created account when the audit append fails', async () => {
    appendServerAuditMock.mockRejectedValueOnce(new Error('audit unavailable'))

    const res = await POST(makeRequest({ email: 'new@client.lv', cardNumber: '1002', phone: '+37120000001' }))

    expect(res.status).toBe(500)
    expect(h.committed).toEqual([])
  })
})
