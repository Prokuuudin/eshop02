import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Stateful harness: staged transaction state, published on success; one
// transaction at a time (the batch advisory lock). The SMS transport is the
// existing development-only simulation; production must answer 503.

type Delivery = { userId: string; channel: string; status: string }
type Audit = { actorId: string; action: string; entityId: string; requestId?: string; after?: unknown }
type State = { deliveries: Delivery[]; audits: Audit[] }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  requireAdmin: vi.fn(),
  appendServerAudit: vi.fn(),
  getTemplates: vi.fn(),
  users: [] as Array<{ id: string; name: string | null; phone: string; cardNumber: string }>,
}))

function db(s: State) {
  return {
    _state: s,
    $executeRaw: async () => 0,
    user: {
      findMany: async ({ where }: { where: { id: { in: string[] } } }) => h.users.filter((u) => where.id.in.includes(u.id)),
    },
    auditLog: {
      findFirst: async ({ where }: { where: { requestId: string; action: string } }) =>
        s.audits.find((a) => a.requestId === where.requestId && a.action === where.action) ?? null,
    },
    invitationDelivery: {
      createMany: async ({ data }: { data: Delivery[] }) => { s.deliveries.push(...data); return { count: data.length } },
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
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: h.getTemplates }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://example.test') }))

import { POST } from './route'

const ADMIN = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function post(userIds: unknown, key?: string, language = 'lv'): Promise<Response> {
  return POST(new NextRequest('http://localhost/api/admin/invitations/sms', {
    method: 'POST',
    body: JSON.stringify({ userIds, language }),
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  h.queue = Promise.resolve()
  h.state = { deliveries: [], audits: [] }
  h.users = [
    { id: 'u1', name: 'Anna Liepa', phone: '+37120000001', cardNumber: '1001' },
    { id: 'u2', name: 'Jānis Ozols', phone: '+37120000002', cardNumber: '1002' },
  ]
  h.requireAdmin.mockResolvedValue(ADMIN)
  h.getTemplates.mockResolvedValue([{ id: 'sms-invite-lv', body: 'Sveiki, {{name}}! Karte {{card_number}}: {{registration_url}}' }])
  h.appendServerAudit.mockImplementation(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
    tx._state.audits.push({ actorId: actor.id, ...input })
  })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('POST /api/admin/invitations/sms', () => {
  it('rejects non-admins without writes', async () => {
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post(['u1'])).status).toBe(403)
    expect(h.state.deliveries).toHaveLength(0)
  })

  it.each([
    [[], 'no_user_ids'],
    [Array.from({ length: 21 }, (_, i) => `u${i}`), 'too_many'],
  ])('rejects an invalid batch %#', async (userIds, error) => {
    const res = await post(userIds)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(error)
  })

  it('rejects a malformed idempotency key', async () => {
    expect((await post(['u1'], 'x')).status).toBe(400)
  })

  it('keeps refusing production without a provider and records nothing', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    const res = await post(['u1'])
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('sms_provider_not_configured')
    expect(h.state).toEqual({ deliveries: [], audits: [] })
  })

  it('records the simulated batch and one audit event without phones or message text', async () => {
    const res = await post(['u1', 'u2'], 'sms-key-00001')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ simulated: true, results: [
      { userId: 'u1', phone: '+37120000001', status: 'simulated', message: 'Sveiki, Anna Liepa! Karte 1001: https://example.test/auth/register' },
      { userId: 'u2', phone: '+37120000002', status: 'simulated', message: 'Sveiki, Jānis Ozols! Karte 1002: https://example.test/auth/register' },
    ] })
    expect(h.state.deliveries).toEqual([
      { userId: 'u1', channel: 'sms', status: 'sent' },
      { userId: 'u2', channel: 'sms', status: 'sent' },
    ])
    expect(h.state.audits).toEqual([{
      actorId: 'admin-1', action: 'invitation.sms_recorded', entityType: 'invitation_batch',
      entityId: 'invitations-sms:admin-1:sms-key-00001', requestId: 'invitations-sms:admin-1:sms-key-00001',
      after: { channel: 'sms', simulated: true, batchSize: 2, userIds: ['u1', 'u2'] },
    }])
    const serialized = JSON.stringify(h.state.audits)
    for (const secret of ['+3712000000', 'Anna', 'Sveiki', '1001', 'auth/register']) expect(serialized).not.toContain(secret)
  })

  it('replays a technical retry without recording the batch again', async () => {
    const first = await (await post(['u1', 'u2'], 'sms-key-00002')).json()
    const second = await (await post(['u1', 'u2'], 'sms-key-00002')).json()

    expect(second).toEqual({ ...first, replayed: true })
    expect(h.state.deliveries).toHaveLength(2)
    expect(h.state.audits).toHaveLength(1)
  })

  it('processes a concurrent duplicate with the same key once', async () => {
    await Promise.all([post(['u1'], 'sms-key-00003'), post(['u1'], 'sms-key-00003')])
    expect(h.state.deliveries).toHaveLength(1)
    expect(h.state.audits).toHaveLength(1)
  })

  it('keeps an explicit repeat (new action, new key) available', async () => {
    await post(['u1'], 'sms-key-00004')
    await post(['u1'], 'sms-key-00005')
    expect(h.state.deliveries).toHaveLength(2)
    expect(h.state.audits).toHaveLength(2)
  })

  it('rolls the delivery rows back when the audit append fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const res = await post(['u1'])
    expect(res.status).toBe(500)
    expect(h.state).toEqual({ deliveries: [], audits: [] })
  })

  it('records nothing for a batch without eligible clients', async () => {
    h.users = []
    const res = await post(['u9'])
    expect(await res.json()).toEqual({ simulated: true, results: [] })
    expect(h.state).toEqual({ deliveries: [], audits: [] })
  })
})
