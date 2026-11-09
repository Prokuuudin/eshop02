import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { hashInviteToken } from '@/lib/invitations'

// Stateful harness for POST /api/admin/invitations: each $transaction works on
// a staged copy and publishes it only when the callback resolves; transactions
// run one at a time, as the batch/user advisory locks guarantee. SMTP is mocked.

type Token = { tokenHash: string; userId: string; status: string; createdAt: number; email: string; cardNumber: string; language: string; expiresAt: Date }
type Delivery = { userId: string; channel: string; status: string; sentAt: number }
type Audit = { actorId: string; action: string; entityType: string; entityId: string; requestId?: string; before?: unknown; after?: unknown }
type User = { id: string; name: string | null; email: string; cardNumber: string | null; platformRole: string; teamRole: string | null; superAdmin: boolean }
type State = { users: User[]; tokens: Token[]; deliveries: Delivery[]; audits: Audit[] }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  requireAdmin: vi.fn(),
  sendEmail: vi.fn(),
  appendServerAudit: vi.fn(),
  failDeliveryAudit: false,
}))

function db(s: State) {
  return {
    _state: s,
    $executeRaw: async () => 0,
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => s.users.filter((u) =>
        where.id.in.includes(u.id) && u.cardNumber !== null
        && !u.email.endsWith('@client.local') && !u.email.endsWith('@deleted.invalid')),
    },
    auditLog: {
      findMany: async ({ where }: { where: { requestId: string; action: { in: string[] } } }) =>
        s.audits.filter((a) => a.requestId === where.requestId && where.action.in.includes(a.action)).map((a) => ({ entityId: a.entityId })),
      findFirst: async ({ where }: { where: { requestId: string; action: string } }) =>
        s.audits.find((a) => a.requestId === where.requestId && a.action === where.action) ?? null,
    },
    invitationToken: {
      findFirst: async ({ where }: { where: { userId: string } }) => {
        const rows = s.tokens.filter((t) => t.userId === where.userId).sort((a, b) => b.createdAt - a.createdAt)
        return rows[0] ? { status: rows[0].status, createdAt: new Date(rows[0].createdAt) } : null
      },
      deleteMany: async ({ where }: { where: { userId: string } }) => {
        const before = s.tokens.length
        s.tokens = s.tokens.filter((t) => t.userId !== where.userId || t.status === 'accepted')
        return { count: before - s.tokens.length }
      },
      create: async ({ data }: { data: Omit<Token, 'status' | 'createdAt'> }) => {
        s.tokens.push({ ...data, status: 'sent', createdAt: Date.now() })
      },
      updateMany: async ({ where, data }: { where: { tokenHash: { in: string[] }; status: string }; data: { status: string } }) => {
        let count = 0
        for (const t of s.tokens) if (where.tokenHash.in.includes(t.tokenHash) && t.status === where.status) { t.status = data.status; count += 1 }
        return { count }
      },
    },
    invitationDelivery: {
      findFirst: async ({ where }: { where: { userId: string; channel: string; sentAt: { gte: Date } } }) =>
        s.deliveries.find((d) => d.userId === where.userId && d.channel === where.channel && d.sentAt >= where.sentAt.gte.getTime()) ?? null,
      createMany: async ({ data }: { data: Array<Omit<Delivery, 'sentAt'>> }) => {
        for (const row of data) s.deliveries.push({ ...row, sentAt: Date.now() })
        return { count: data.length }
      },
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => {
  const live = new Proxy({}, {
    get(_target, key: string) {
      if (key === '$transaction') {
        return async (run: (tx: ReturnType<typeof db>) => Promise<unknown>) => {
          const previous = h.queue
          let release = (): void => undefined
          h.queue = new Promise<void>((resolve) => { release = resolve })
          await previous
          try {
            const staged = structuredClone(h.state)
            const result = await run(db(staged))
            h.state = staged
            return result
          } finally {
            release()
          }
        }
      }
      return db(h.state)[key as keyof ReturnType<typeof db>]
    },
  })
  return { prisma: live }
})
vi.mock('@/lib/server-auth', () => ({ requireAdmin: h.requireAdmin }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/mailer', () => ({ sendEmail: h.sendEmail }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn().mockResolvedValue([]) }))
vi.mock('@/lib/invitation-emails', () => ({
  buildInviteEmail: vi.fn((_lang: string, vars: { inviteUrl: string; cardNumber: string }) => ({
    subject: 'Invite', html: `<p>Karte ${vars.cardNumber}</p><a href="${vars.inviteUrl}">Aktivizēt</a>`,
  })),
  pickInviteTemplate: vi.fn(() => undefined),
}))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://example.test') }))

import { POST } from './route'

const ADMIN = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }
const customer = (id: string, extra: Partial<User> = {}): User => ({
  id, name: `Client ${id}`, email: `${id}@inbox.lv`, cardNumber: `44007${id.replace(/\D/gu, '')}`,
  platformRole: 'customer', teamRole: null, superAdmin: false, ...extra,
})

function post(userIds: unknown, key?: string): Promise<Response> {
  return POST(new NextRequest('http://localhost/api/admin/invitations', {
    method: 'POST',
    body: JSON.stringify({ userIds }),
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
  }))
}

const live = (userId: string) => h.state.tokens.filter((t) => t.userId === userId && t.status === 'sent')
const actions = () => h.state.audits.map((a) => a.action)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T10:00:00Z'))
  h.queue = Promise.resolve()
  h.failDeliveryAudit = false
  h.state = { users: [customer('u1'), customer('u2'), customer('u3')], tokens: [], deliveries: [], audits: [] }
  h.requireAdmin.mockResolvedValue(ADMIN)
  h.sendEmail.mockResolvedValue(undefined)
  h.appendServerAudit.mockImplementation(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
    if (h.failDeliveryAudit && input.action === 'invitation.delivery_recorded') throw new Error('audit unavailable')
    tx._state.audits.push({ actorId: actor.id, ...input })
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/admin/invitations — validation and permissions', () => {
  it('rejects non-admins before reading or writing anything', async () => {
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await post(['u1'])
    expect(res.status).toBe(403)
    expect(h.state.tokens).toHaveLength(0)
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it.each([
    [[], 'no_user_ids'],
    ['u1', 'no_user_ids'],
    [Array.from({ length: 21 }, (_, i) => `u${i}`), 'too_many'],
  ])('rejects an invalid batch %#', async (userIds, error) => {
    const res = await post(userIds)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(error)
    expect(h.state.tokens).toHaveLength(0)
  })

  it('rejects a malformed idempotency key', async () => {
    const res = await post(['u1'], 'bad key!')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_idempotency_key')
  })

  it('never issues a card invitation to a staff account, only to customers', async () => {
    h.state.users = [
      customer('c1'),
      customer('o1', { teamRole: 'admin' }),
      customer('a1', { platformRole: 'admin', superAdmin: true }),
      customer('m1', { teamRole: 'manager' }),
    ]
    const res = await post(['c1', 'o1', 'a1', 'm1'])
    expect(res.status).toBe(200)
    expect(h.state.tokens.map((t) => t.userId)).toEqual(['c1', 'o1'])
    expect(h.sendEmail.mock.calls.map(([to]) => to)).toEqual(['c1@inbox.lv', 'o1@inbox.lv'])
  })
})

describe('POST /api/admin/invitations — batch, audit and delivery', () => {
  it('issues a batch, audits each invitation in the token transaction and records delivery after it', async () => {
    h.sendEmail.mockImplementation(async (to: string) => {
      // The token and its audit row are committed before any email leaves.
      expect(h.state.tokens.some((t) => `${t.userId}@inbox.lv` === to)).toBe(true)
      expect(actions()).not.toContain('invitation.delivery_recorded')
      if (to === 'u2@inbox.lv') throw new Error('SMTP down')
    })

    const res = await post(['u1', 'u2', 'u3'], 'batch-key-0001')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.results.map((r: { userId: string; status: string }) => [r.userId, r.status])).toEqual([['u1', 'sent'], ['u2', 'error'], ['u3', 'sent']])
    expect(body.results[0].inviteUrl).toMatch(/^https:\/\/example\.test\/auth\/invite\?token=[a-f0-9]{64}$/u)
    expect(actions()).toEqual(['invitation.created', 'invitation.created', 'invitation.created', 'invitation.delivery_recorded'])
    const [created, , , delivery] = h.state.audits
    expect(created).toEqual({
      actorId: 'admin-1', action: 'invitation.created', entityType: 'user', entityId: 'u1',
      requestId: 'invitations-email:admin-1:batch-key-0001',
      before: null, after: { channel: 'email', language: 'lv', expiresAt: expect.any(String), batchSize: 3 },
    })
    expect(delivery).toMatchObject({
      entityType: 'invitation_batch', entityId: 'invitations-email:admin-1:batch-key-0001',
      after: { channel: 'email', batchSize: 3, sent: ['u1', 'u3'], failed: ['u2'], pending: [] },
    })
    expect(h.state.tokens.find((t) => t.userId === 'u2')?.status).toBe('error')
    expect(h.state.deliveries.map((d) => [d.userId, d.status])).toEqual([['u1', 'sent'], ['u3', 'sent'], ['u2', 'error']])
  })

  it('keeps tokens, token hashes, emails, phones, names, card numbers and message text out of the audit', async () => {
    const res = await post(['u1', 'u2'], 'secret-check-01')
    const body = await res.json()
    const tokens = body.results.map((r: { inviteUrl: string }) => r.inviteUrl.split('token=')[1])
    const serialized = JSON.stringify(h.appendServerAudit.mock.calls.map((call) => call[3]))
    for (const secret of [...tokens, ...tokens.map(hashInviteToken), 'u1@inbox.lv', 'Client u1', '440071', 'Karte', 'Aktivizēt', 'example.test']) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('rolls back every token of the batch and sends nothing when the audit append fails', async () => {
    h.state.tokens = [{ tokenHash: 'old', userId: 'u1', status: 'error', createdAt: 0, email: 'u1@inbox.lv', cardNumber: '101', language: 'lv', expiresAt: new Date(0) }]
    h.appendServerAudit
      .mockImplementationOnce(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => { tx._state.audits.push({ actorId: actor.id, ...input }) })
      .mockRejectedValueOnce(new Error('audit unavailable'))
    const before = structuredClone(h.state)

    const res = await post(['u1', 'u2'])

    expect(res.status).toBe(500)
    expect(h.state).toEqual(before)
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('keeps the committed invitation and still retires a failed token when recording the delivery fails', async () => {
    h.failDeliveryAudit = true
    h.sendEmail.mockRejectedValue(new Error('SMTP down'))

    const res = await post(['u1'])

    expect(res.status).toBe(200)
    expect((await res.json()).results[0].status).toBe('error')
    expect(actions()).toEqual(['invitation.created'])
    expect(h.state.tokens[0].status).toBe('error')
  })
})

describe('POST /api/admin/invitations — repeats and concurrency', () => {
  it('replays a technical retry with the same key: no new token, email or event', async () => {
    await post(['u1', 'u2'], 'retry-key-0001')
    const tokens = structuredClone(h.state.tokens)
    const audits = h.state.audits.length

    const res = await post(['u1', 'u2'], 'retry-key-0001')
    const body = await res.json()

    expect(body.replayed).toBe(true)
    expect(body.results).toEqual([
      { userId: 'u1', email: 'u1@inbox.lv', status: 'sent' },
      { userId: 'u2', email: 'u2@inbox.lv', status: 'sent' },
    ])
    expect(h.state.tokens).toEqual(tokens)
    expect(h.state.audits).toHaveLength(audits)
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
  })

  it('a concurrent duplicate with the same key is processed once', async () => {
    const [first, second] = await Promise.all([post(['u1'], 'double-key-0001'), post(['u1'], 'double-key-0001')])
    const bodies = [await first.json(), await second.json()]

    expect(bodies.filter((b) => b.replayed)).toHaveLength(1)
    expect(h.state.tokens).toHaveLength(1)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
    expect(actions().filter((a) => a === 'invitation.created')).toHaveLength(1)
  })

  it('a concurrent request with another key skips a user whose email is still being sent', async () => {
    let releaseSmtp = (): void => undefined
    h.sendEmail.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSmtp = resolve }))

    const first = post(['u1'], 'first-key-0001')
    await vi.waitFor(() => expect(h.sendEmail).toHaveBeenCalledTimes(1))
    const second = await (await post(['u1', 'u2'], 'second-key-001')).json()
    releaseSmtp()
    const firstBody = await (await first).json()

    expect(second.results).toEqual([
      { userId: 'u1', email: 'u1@inbox.lv', status: 'pending' },
      expect.objectContaining({ userId: 'u2', status: 'sent' }),
    ])
    expect(firstBody.results[0].status).toBe('sent')
    expect(live('u1')).toHaveLength(1)
    expect(h.sendEmail.mock.calls.filter(([to]) => to === 'u1@inbox.lv')).toHaveLength(1)
    expect(h.state.audits.filter((a) => a.entityId === 'u1')).toHaveLength(1)
    expect(h.state.audits.find((a) => a.requestId === 'invitations-email:admin-1:second-key-001' && a.action === 'invitation.delivery_recorded')?.after)
      .toMatchObject({ sent: ['u2'], pending: ['u1'] })
  })

  it('keeps the explicit resend: after delivery, a new request replaces the invitation', async () => {
    await post(['u1'])
    const firstToken = h.state.tokens[0].tokenHash

    const res = await post(['u1'])

    expect((await res.json()).results[0].status).toBe('sent')
    expect(live('u1')).toHaveLength(1)
    expect(h.state.tokens[0].tokenHash).not.toBe(firstToken)
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
    expect(h.state.audits.filter((a) => a.entityId === 'u1').map((a) => [a.action, a.before])).toEqual([
      ['invitation.created', null],
      ['invitation.replaced', { openInvitations: 1 }],
    ])
  })

  it('allows an immediate resend after a failed delivery', async () => {
    h.sendEmail.mockRejectedValueOnce(new Error('SMTP down'))
    await post(['u1'])

    const res = await post(['u1'])

    expect((await res.json()).results[0].status).toBe('sent')
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
  })

  it('treats an unfinished delivery older than the in-flight window as resendable', async () => {
    h.state.tokens = [{ tokenHash: 'stale', userId: 'u1', status: 'sent', createdAt: Date.now() - 61_000, email: 'u1@inbox.lv', cardNumber: '101', language: 'lv', expiresAt: new Date(0) }]

    const res = await post(['u1'])

    expect((await res.json()).results[0].status).toBe('sent')
    expect(h.state.tokens.map((t) => t.tokenHash)).not.toContain('stale')
  })
})
