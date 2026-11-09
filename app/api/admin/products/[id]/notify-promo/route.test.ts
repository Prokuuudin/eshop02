import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Stateful harness: audit rows and in-app notifications are staged per
// transaction and published only on success; transactions run one at a time
// (the batch advisory lock). The real product-news planner and sender run;
// SMTP itself is mocked — no email is sent.

type Audit = { actorId: string; action: string; entityType: string; entityId: string; requestId?: string; after?: unknown }
type Notification = { userId: string; type: string; title: string; message: string; link: string; channel: string; emailSent: boolean }
type State = { audits: Audit[]; notifications: Notification[] }
type Subscriber = { userId: string; user: { email: string; notificationChannel: string | null } }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  subscribers: [] as Subscriber[],
  product: null as null | { id: string; title: string; isDeleted: boolean },
  requireAdminPermission: vi.fn(),
  appendServerAudit: vi.fn(),
  sendEmail: vi.fn(),
}))

function db(s: State) {
  return {
    _state: s,
    $executeRaw: async () => 0,
    auditLog: {
      findMany: async ({ where }: { where: { requestId: string; action: { in: string[] } } }) =>
        s.audits.filter((a) => a.requestId === where.requestId && where.action.in.includes(a.action)),
    },
    userNotification: {
      createMany: async ({ data }: { data: Notification[] }) => { s.notifications.push(...data); return { count: data.length } },
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn(), logOperationalEvent: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: h.requireAdminPermission }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/mailer', () => ({ sendEmail: h.sendEmail }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findUnique: async () => h.product },
    productNewsSubscription: { findMany: async () => structuredClone(h.subscribers) },
    userNotification: {
      createMany: async ({ data }: { data: Notification[] }) => { h.state.notifications.push(...data); return { count: data.length } },
    },
    $transaction: async (run: (tx: ReturnType<typeof db>) => Promise<unknown>) => {
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
    },
  },
}))

import { POST } from './route'

const SUBSCRIBERS: Subscriber[] = [
  { userId: 'u1', user: { email: 'email-only@inbox.lv', notificationChannel: 'email' } },
  { userId: 'u2', user: { email: 'both@inbox.lv', notificationChannel: 'both' } },
  { userId: 'u3', user: { email: 'app@inbox.lv', notificationChannel: 'app' } },
  { userId: 'u4', user: { email: 'broken', notificationChannel: 'email' } },
]
const writeAudit = async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
  tx._state.audits.push({ actorId: actor.id, ...input })
}

function post(body: Record<string, unknown> = {}, key?: string, id = 'p1'): Promise<Response> {
  return POST(new NextRequest(`http://localhost/api/admin/products/${id}/notify-promo`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
  }), { params: Promise.resolve({ id }) })
}
const actions = () => h.state.audits.map((a) => a.action)

beforeEach(() => {
  vi.clearAllMocks()
  h.queue = Promise.resolve()
  h.state = { audits: [], notifications: [] }
  h.subscribers = structuredClone(SUBSCRIBERS)
  h.product = { id: 'p1', title: 'Secret Shampoo', isDeleted: false }
  h.requireAdminPermission.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com' })
  h.sendEmail.mockResolvedValue(undefined)
  h.appendServerAudit.mockImplementation(writeAudit)
})

describe('POST /api/admin/products/:id/notify-promo — permissions and input', () => {
  it('rejects a caller without catalog.update before anything is sent or written', async () => {
    h.requireAdminPermission.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post()).status).toBe(403)
    expect(h.requireAdminPermission).toHaveBeenCalledWith('catalog.update')
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(h.state).toEqual({ audits: [], notifications: [] })
  })

  it.each([['missing', null], ['deleted', { id: 'p1', title: 'X', isDeleted: true }]])('404s for a %s product', async (_label, product) => {
    h.product = product
    const res = await post()
    expect(res.status).toBe(404)
    expect((await res.json()).error).toBe('product_not_found')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a malformed idempotency key', async () => {
    const res = await post({}, 'bad key')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_idempotency_key')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('does nothing and audits nothing without subscribers', async () => {
    h.subscribers = []
    expect(await (await post()).json()).toEqual({ ok: true })
    expect(h.state).toEqual({ audits: [], notifications: [] })
  })
})

describe('POST /api/admin/products/:id/notify-promo — delivery and audit', () => {
  it('claims before SMTP, then writes in-app notifications with the result event, counts only', async () => {
    h.sendEmail.mockImplementation(async () => {
      expect(actions()).toEqual(['product.promo_notification_prepared'])
      expect(h.state.notifications).toHaveLength(0)
    })

    const res = await post({ message: '  Tikai šonedēļ -20%  ' }, 'promo-key-0001')

    expect(await res.json()).toEqual({ ok: true })
    expect(h.sendEmail.mock.calls.map(([to]) => to).sort()).toEqual(['both@inbox.lv', 'email-only@inbox.lv'])
    expect(h.sendEmail.mock.calls[0][2]).toContain('Tikai šonedēļ -20%')
    expect(h.state.audits).toEqual([
      {
        actorId: 'admin-1', action: 'product.promo_notification_prepared', entityType: 'product', entityId: 'p1',
        requestId: 'notify-promo:admin-1:promo-key-0001',
        after: { channel: 'email+app', subscribers: 4, emailRecipients: 2, skippedInvalidEmail: 1, appRecipients: 2, customMessage: true },
      },
      {
        actorId: 'admin-1', action: 'product.promo_notification_recorded', entityType: 'product', entityId: 'p1',
        requestId: 'notify-promo:admin-1:promo-key-0001',
        after: { channel: 'email+app', sent: 2, failed: 0, skippedInvalidEmail: 1, appNotifications: 2 },
      },
    ])
    expect(h.state.notifications.map((n) => [n.userId, n.channel, n.emailSent])).toEqual([['u2', 'both', true], ['u3', 'app', false]])
    const serialized = JSON.stringify(h.state.audits)
    for (const secret of ['inbox.lv', 'broken', 'Tikai', 'Secret Shampoo', 'Акция']) expect(serialized).not.toContain(secret)
  })

  it('records a partial SMTP failure and flags the in-app notification accordingly', async () => {
    h.sendEmail.mockImplementation(async (to: string) => {
      if (to === 'both@inbox.lv') throw new Error('SMTP down')
    })
    await post()
    expect(h.state.audits[1].after).toMatchObject({ sent: 1, failed: 1, appNotifications: 2 })
    expect(h.state.notifications.find((n) => n.userId === 'u2')?.emailSent).toBe(false)
  })

  it('sends nothing and writes no notifications when the audit before SMTP fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const res = await post()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('server_error')
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(h.state).toEqual({ audits: [], notifications: [] })
  })

  it('keeps the in-app notifications when the result audit fails, and a retry never re-mails', async () => {
    h.appendServerAudit.mockImplementationOnce(writeAudit).mockRejectedValueOnce(new Error('audit down'))

    expect(await (await post({}, 'promo-key-0002')).json()).toEqual({ ok: true })
    expect(h.state.notifications).toHaveLength(2)
    expect(actions()).toEqual(['product.promo_notification_prepared'])

    const retry = await post({}, 'promo-key-0002')
    expect(retry.status).toBe(409)
    expect((await retry.json()).error).toBe('in_progress')
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
    expect(h.state.notifications).toHaveLength(2)
  })
})

describe('POST /api/admin/products/:id/notify-promo — repeats and concurrency', () => {
  it('replays a technical retry without new emails, notifications or events', async () => {
    await post({}, 'promo-key-0003')
    const retry = await post({}, 'promo-key-0003')
    expect(await retry.json()).toEqual({ ok: true, replayed: true })
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
    expect(h.state.notifications).toHaveLength(2)
    expect(h.state.audits).toHaveLength(2)
  })

  it('a concurrent duplicate with the same key mails each subscriber once', async () => {
    let releaseSmtp = (): void => undefined
    h.sendEmail.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSmtp = resolve }))

    const first = post({}, 'promo-key-0004')
    await vi.waitFor(() => expect(h.sendEmail).toHaveBeenCalledTimes(2))
    const duplicate = await post({}, 'promo-key-0004')
    releaseSmtp()
    await first

    expect(duplicate.status).toBe(409)
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
    expect(h.state.notifications).toHaveLength(2)
  })

  it('lets the same key try again when nothing was delivered', async () => {
    h.subscribers = [SUBSCRIBERS[0]]
    h.sendEmail.mockRejectedValueOnce(new Error('SMTP down'))
    await post({}, 'promo-key-0005')

    expect(await (await post({}, 'promo-key-0005')).json()).toEqual({ ok: true })
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
    expect(h.state.audits.at(-1)?.after).toMatchObject({ sent: 1 })
  })

  it('keeps an explicit resend (new action, new key) available', async () => {
    await post({}, 'promo-key-0006')
    await post({}, 'promo-key-0007')
    expect(h.sendEmail).toHaveBeenCalledTimes(4)
    expect(h.state.notifications).toHaveLength(4)
  })
})
