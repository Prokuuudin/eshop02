import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('@/lib/account-owner-lock', async () => (await import('@/tests/helpers/account-owner-lock-mock')).accountOwnerLockPassthrough())
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
  transactionOptions: [] as unknown[],
  revokedCardSetting: null as { value: unknown; updatedAt: Date } | null,
}))

function db(s: State) {
  return {
    _state: s,
    $executeRaw: async () => 0,
    keyValueSetting: { findUnique: async ({ where }: { where: { key: string } }) => (where.key === 'revoked-client-cards:admin:v1' ? null : h.revokedCardSetting) },
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] }; cardNumber: { notIn?: string[] } } }) => s.users.filter((u) =>
        where.id.in.includes(u.id) && u.cardNumber !== null && !where.cardNumber.notIn?.includes(u.cardNumber)
        && !u.email.endsWith('@client.local') && !u.email.endsWith('@deleted.invalid')),
    },
    auditLog: {
      findMany: async ({ where }: { where: { requestId: string; action: { in: string[] } } }) =>
        s.audits.filter((a) => a.requestId === where.requestId && where.action.in.includes(a.action)).map((a) => ({ entityId: a.entityId })),
      findFirst: async ({ where }: { where: { requestId: string; action: string } }) =>
        s.audits.find((a) => a.requestId === where.requestId && a.action === where.action) ?? null,
    },
    invitationToken: {
      findMany: async ({ where }: { where: { userId: { in: string[] }; OR: Array<{ status: string; expiresAt?: { gt: Date } }> } }) =>
        s.tokens
          .filter((t) => where.userId.in.includes(t.userId) && where.OR.some((c) =>
            t.status === c.status && (!c.expiresAt || new Date(t.expiresAt).getTime() > c.expiresAt.gt.getTime())))
          .map((t) => ({ userId: t.userId })),
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

vi.mock('@/lib/marketing-suppression', async () => (await import('@/tests/helpers/marketing-suppression-mock')).marketingSuppressionPassthrough())
vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => {
  const live = new Proxy({}, {
    get(_target, key: string) {
      if (key === '$transaction') {
        return async (run: (tx: ReturnType<typeof db>) => Promise<unknown>, options?: unknown) => {
          h.transactionOptions.push(options)
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
import { resetRevokedCardPolicyCache } from '@/lib/revoked-card-policy'
import { buildRevokedCardValue, revokedCardRow } from '@/lib/revoked-card-policy-fixture'

const ADMIN = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }
const customer = (id: string, extra: Partial<User> = {}): User => ({
  id, name: `Client ${id}`, email: `${id}@inbox.lv`, cardNumber: `44007${id.replace(/\D/gu, '')}`,
  platformRole: 'customer', teamRole: null, superAdmin: false, ...extra,
})

function post(userIds: unknown, key?: string, extra: Record<string, unknown> = {}): Promise<Response> {
  return POST(new NextRequest('http://localhost/api/admin/invitations', {
    method: 'POST',
    body: JSON.stringify({ userIds, ...extra }),
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
  h.transactionOptions = []
  h.revokedCardSetting = null
  resetRevokedCardPolicyCache()
  h.state ={ users: [customer('u1'), customer('u2'), customer('u3')], tokens: [], deliveries: [], audits: [] }
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

describe('POST /api/admin/invitations — revoked cards', () => {
  it('skips a revoked card holder and invites the rest of the batch', async () => {
    h.revokedCardSetting = revokedCardRow(buildRevokedCardValue({ '440071': 'u1' }))

    const res = await post(['u1', 'u2'], 'revoked-batch')

    expect(res.status).toBe(200)
    expect(live('u1')).toHaveLength(0)
    expect(live('u2')).toHaveLength(1)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('fails closed before any token or email when the registry row is malformed', async () => {
    h.revokedCardSetting = revokedCardRow({ active: true })

    const res = await post(['u1', 'u2'], 'broken-registry')

    expect(res.status).toBe(503)
    expect(h.state.tokens).toHaveLength(0)
    expect(h.sendEmail).not.toHaveBeenCalled()
  })
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
    [Array.from({ length: 6 }, (_, i) => `u${i}`), 'too_many'],
  ])('rejects an invalid batch %#', async (userIds, error) => {
    const res = await post(userIds)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(error)
    expect(h.state.tokens).toHaveLength(0)
  })

  it('accepts exactly the chunk size the admin page sends', async () => {
    const { EMAIL_INVITE_BATCH_SIZE: server } = await import('@/lib/invitations')
    const { EMAIL_INVITE_BATCH_SIZE: page } = await import('@/app/[lang]/admin/invitations/invitation-models')
    expect(page).toBe(server)
    h.state.users = Array.from({ length: server }, (_, i) => customer(`u${i + 1}`))
    expect((await post(h.state.users.map((u) => u.id))).status).toBe(200)
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

  it('gives the token transaction an explicit timeout above the 5 s Prisma default', async () => {
    await post(['u1'])

    // A 20-client batch is ~160 sequential round-trips to Neon (us-east-1) from
    // Plesk (EU): the default 5 s interactive timeout rolled the whole batch back.
    expect(h.transactionOptions[0]).toMatchObject({ timeout: expect.any(Number), maxWait: expect.any(Number) })
    expect((h.transactionOptions[0] as { timeout: number }).timeout).toBeGreaterThanOrEqual(30_000)
  })

  it('bulk mode skips clients with a live or accepted invitation, but re-invites expired and failed ones', async () => {
    const token = (userId: string, status: string, expiresAt: Date): Token => ({
      tokenHash: `h-${userId}`, userId, status, createdAt: Date.now() - 3_600_000, email: `${userId}@inbox.lv`, cardNumber: '1', language: 'lv', expiresAt,
    })
    h.state.users = ['live', 'acc', 'exp', 'err', 'new'].map((id) => customer(id))
    h.state.tokens = [
      token('live', 'sent', new Date(Date.now() + 86_400_000)),
      token('acc', 'accepted', new Date(0)),
      token('exp', 'sent', new Date(Date.now() - 1_000)),
      token('err', 'error', new Date(Date.now() + 86_400_000)),
    ]

    const res = await post(['live', 'acc', 'exp', 'err', 'new'], 'bulk-skip-0001', { skipInvited: true })
    const body = await res.json()

    expect(body.results.map((r: { userId: string; status: string }) => [r.userId, r.status])).toEqual([
      ['live', 'skipped'], ['acc', 'skipped'], ['exp', 'sent'], ['err', 'sent'], ['new', 'sent'],
    ])
    expect(h.sendEmail.mock.calls.map(([to]) => to)).toEqual(['exp@inbox.lv', 'err@inbox.lv', 'new@inbox.lv'])
    expect(h.state.tokens.find((t) => t.userId === 'live')?.tokenHash).toBe('h-live')
    expect(h.state.audits.filter((a) => a.entityId === 'live' || a.entityId === 'acc')).toHaveLength(0)
    expect(h.state.audits.find((a) => a.action === 'invitation.delivery_recorded')?.after).toMatchObject({ skipped: ['live', 'acc'] })
  })

  it('35 selected clients in chunks: partial SMTP failure, then a repeat sends only to the failed ones', async () => {
    const ids = Array.from({ length: 35 }, (_, i) => `c${i + 1}`)
    h.state.users = [...ids.map((id) => customer(id)), customer('p1', { email: 'p1@client.local' })]
    const failing = new Set(['c3@inbox.lv', 'c17@inbox.lv', 'c33@inbox.lv'])
    h.sendEmail.mockImplementation(async (to: string) => { if (failing.has(to)) throw new Error('SMTP 451') })
    const selection = [...ids, 'p1']

    const run = async (round: string) => {
      const statuses: string[] = []
      for (let i = 0; i < selection.length; i += 5) {
        const chunk = selection.slice(i, i + 5)
        const body = await (await post(chunk, `${round}-chunk-${i}`, { skipInvited: true })).json()
        statuses.push(...body.results.map((r: { status: string }) => r.status))
      }
      return statuses
    }

    const first = await run('first')
    expect(first.filter((s) => s === 'sent')).toHaveLength(32)
    expect(first.filter((s) => s === 'error')).toHaveLength(3)
    expect(first).toHaveLength(35) // phone-only p1 is not an email recipient
    expect(h.sendEmail).toHaveBeenCalledTimes(35)

    failing.clear()
    h.sendEmail.mockClear()
    const second = await run('second')

    expect(second.filter((s) => s === 'skipped')).toHaveLength(32)
    expect(second.filter((s) => s === 'sent')).toHaveLength(3)
    expect(h.sendEmail.mock.calls.map(([to]) => to).sort()).toEqual(['c17@inbox.lv', 'c33@inbox.lv', 'c3@inbox.lv'])
    for (const id of ids) {
      expect(live(id)).toHaveLength(1)
      expect(h.state.deliveries.filter((d) => d.userId === id && d.status === 'sent')).toHaveLength(1)
    }
  })

  it('treats an unfinished delivery older than the in-flight window as resendable', async () => {
    h.state.tokens = [{ tokenHash: 'stale', userId: 'u1', status: 'sent', createdAt: Date.now() - 61_000, email: 'u1@inbox.lv', cardNumber: '101', language: 'lv', expiresAt: new Date(0) }]

    const res = await post(['u1'])

    expect((await res.json()).results[0].status).toBe('sent')
    expect(h.state.tokens.map((t) => t.tokenHash)).not.toContain('stale')
  })
})

describe('POST /api/admin/invitations — «Рассылки запрещены»', () => {
  const blocked = new Set<string>()

  beforeEach(async () => {
    blocked.clear()
    const suppression = await import('@/lib/marketing-suppression')
    vi.mocked(suppression.suppressedUserIds).mockImplementation(async (_db?: unknown, ids?: string[]) => (ids ?? []).filter((id) => blocked.has(id)))
  })

  afterEach(async () => {
    const suppression = await import('@/lib/marketing-suppression')
    vi.mocked(suppression.suppressedUserIds).mockImplementation(async () => [])
  })

  it('a direct API request for a blocked client issues no token and sends nothing; the rest of the bulk batch goes out', async () => {
    blocked.add('u1')
    const res = await post(['u1', 'u2', 'u3'], 'blocked-bulk', { skipInvited: true })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.suppressed).toBe(1)
    expect(body.results.find((r: { userId: string }) => r.userId === 'u1')).toMatchObject({ status: 'suppressed' })
    expect(h.state.tokens.filter((t) => t.userId === 'u1')).toHaveLength(0)
    expect(h.sendEmail.mock.calls.map(([to]) => to)).toEqual(['u2@inbox.lv', 'u3@inbox.lv'])
    const delivery = h.state.audits.find((a) => a.action === 'invitation.delivery_recorded')
    expect(delivery?.after).toMatchObject({ sent: ['u2', 'u3'], suppressed: ['u1'] })
  })

  it('a batch of only blocked clients sends nothing and still records the exclusion', async () => {
    blocked.add('u1')
    const res = await post(['u1'], 'only-blocked')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ results: [{ userId: 'u1', email: 'u1@inbox.lv', status: 'suppressed' }], suppressed: 1 })
    expect(h.state.tokens).toHaveLength(0)
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(actions()).toEqual(['invitation.delivery_recorded'])
  })

  it('a repeat (resend) to a client blocked after the first invitation is refused', async () => {
    expect((await post(['u1'], 'first-send')).status).toBe(200)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)

    blocked.add('u1')
    const res = await post(['u1'], 'resend-after-block')
    expect((await res.json()).results).toEqual([{ userId: 'u1', email: 'u1@inbox.lv', status: 'suppressed' }])
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
    // The earlier, already delivered invitation is not touched: the block is not a sign-in ban.
    expect(live('u1')).toHaveLength(1)
  })

  it('a block set after the token was issued stops the email at send time and retires the token', async () => {
    const suppression = await import('@/lib/marketing-suppression')
    vi.mocked(suppression.sendMarketingEmail).mockImplementationOnce(async () => 'suppressed')

    const res = await post(['u1', 'u2'], 'late-block')
    const body = await res.json()

    expect(body.results.map((r: { userId: string; status: string }) => [r.userId, r.status])).toEqual([['u1', 'suppressed'], ['u2', 'sent']])
    expect(h.sendEmail.mock.calls.map(([to]) => to)).toEqual(['u2@inbox.lv'])
    expect(live('u1')).toHaveLength(0)
    expect(h.state.tokens.find((t) => t.userId === 'u1')?.status).toBe('error')
    expect(h.state.audits.find((a) => a.action === 'invitation.delivery_recorded')?.after).toMatchObject({ suppressed: ['u1'], sent: ['u2'] })
  })

  it('a technical retry of the batch replays the exclusion without sending', async () => {
    const suppression = await import('@/lib/marketing-suppression')
    vi.mocked(suppression.sendMarketingEmail).mockImplementationOnce(async () => 'suppressed')
    await post(['u1', 'u2'], 'late-block-retry')
    const retry = await post(['u1', 'u2'], 'late-block-retry')

    expect((await retry.json()).results.map((r: { status: string }) => r.status)).toEqual(['suppressed', 'sent'])
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })
})
