import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Stateful harness for POST /api/admin/card-rules-campaign: the campaign KV row
// and audit rows are staged per transaction and published only on success;
// transactions run one at a time, as the campaign advisory lock guarantees.
// The real readCampaign/writeCampaign are used; SMTP is mocked.

type Audit = { actorId: string; action: string; entityType: string; entityId: string; requestId?: string; before?: unknown; after?: unknown }
type State = { kv: Record<string, unknown>; audits: Audit[] }
type User = { id: string; name: string | null; email: string; platformRole: string; cardNumber: string | null }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  users: [] as User[],
  requireAdmin: vi.fn(),
  sendEmail: vi.fn(),
  appendServerAudit: vi.fn(),
  getTemplates: vi.fn(),
}))

function db(s: State) {
  return {
    _state: s,
    $executeRaw: async () => 0,
    keyValueSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (where.key in s.kv ? { key: where.key, value: structuredClone(s.kv[where.key]) } : null),
      upsert: async ({ where, update }: { where: { key: string }; update: { value: unknown } }) => { s.kv[where.key] = structuredClone(update.value) },
    },
    auditLog: {
      findFirst: async ({ where }: { where: { requestId: string; action: string | { in: string[] } } }) =>
        s.audits.find((a) => a.requestId === where.requestId
          && (typeof where.action === 'string' ? a.action === where.action : where.action.in.includes(a.action))) ?? null,
    },
    user: {
      findMany: async ({ where, take }: { where: { id?: { gt: string } }; take: number }) => h.users
        .filter((u) => u.cardNumber === null && u.platformRole !== 'admin' && u.email.includes('@') && !u.email.endsWith('@client.local'))
        .filter((u) => !where.id || u.id > where.id.gt)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, take),
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
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: h.getTemplates }))
vi.mock('@/lib/invitation-emails', () => ({
  buildRulesEmail: vi.fn((_lang: string, vars: { name: string }) => ({ subject: 'Noteikumi', html: `<p>Sveiki, ${vars.name}! Kartes noteikumi.</p>` })),
}))

import { POST } from './route'
import { CAMPAIGN_KV_KEY } from '@/lib/invitations'

const ADMIN = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }
const IDLE = { sentCount: 0, errorCount: 0, cursor: null, lastRunAt: null, finished: false, runningSince: null }
const client = (n: number, extra: Partial<User> = {}): User => ({
  id: `u${String(n).padStart(3, '0')}`, name: `Klients ${n}`, email: `klients${n}@inbox.lv`, platformRole: 'customer', cardNumber: null, ...extra,
})

function post(body: Record<string, unknown> = {}, key?: string): Promise<Response> {
  return POST(new NextRequest('http://localhost/api/admin/card-rules-campaign', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
  }))
}

const campaign = () => h.state.kv[CAMPAIGN_KV_KEY] as typeof IDLE & Record<string, unknown>
const actions = () => h.state.audits.map((a) => a.action)

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T12:00:00Z'))
  h.queue = Promise.resolve()
  h.state = { kv: {}, audits: [] }
  h.users = [client(1), client(2), client(3, { cardNumber: '1003' }), client(4)]
  h.requireAdmin.mockResolvedValue(ADMIN)
  h.sendEmail.mockResolvedValue(undefined)
  h.getTemplates.mockResolvedValue([])
  h.appendServerAudit.mockImplementation(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
    tx._state.audits.push({ actorId: actor.id, ...input })
  })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/admin/card-rules-campaign — permissions and input', () => {
  it('rejects non-admins without touching the campaign', async () => {
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post()).status).toBe(403)
    expect(h.state).toEqual({ kv: {}, audits: [] })
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a malformed idempotency key', async () => {
    const res = await post({}, 'no')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_idempotency_key')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('keeps answering finished campaigns with 409', async () => {
    h.state.kv[CAMPAIGN_KV_KEY] = { ...IDLE, finished: true }
    const res = await post()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('finished')
    expect(h.state.audits).toHaveLength(0)
  })
})

describe('POST /api/admin/card-rules-campaign — batch', () => {
  it('commits the claim and its event before SMTP, then records the partial result separately', async () => {
    h.sendEmail.mockImplementation(async (to: string) => {
      expect(campaign().runningSince).not.toBeNull()
      expect(actions()).toEqual(['card_rules_campaign.batch_started'])
      if (to === 'klients2@inbox.lv') throw new Error('SMTP down')
    })

    const res = await post({}, 'batch-key-0001')
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.processed).toBe(3)
    expect(body.state).toMatchObject({ sentCount: 2, errorCount: 1, cursor: 'u004', finished: true, runningSince: null })
    expect(h.sendEmail.mock.calls.map(([to]) => to)).toEqual(['klients1@inbox.lv', 'klients2@inbox.lv', 'klients4@inbox.lv'])
    expect(h.state.audits).toEqual([
      {
        actorId: 'admin-1', action: 'card_rules_campaign.batch_started', entityType: 'campaign', entityId: CAMPAIGN_KV_KEY,
        requestId: 'card-rules-campaign:admin-1:batch-key-0001',
        before: { sentCount: 0, errorCount: 0, cursor: null, finished: false, running: false },
        after: { channel: 'email', batchLimit: 50, sentCount: 0, errorCount: 0, cursor: null, finished: false, running: true },
      },
      {
        actorId: 'admin-1', action: 'card_rules_campaign.batch_completed', entityType: 'campaign', entityId: CAMPAIGN_KV_KEY,
        requestId: 'card-rules-campaign:admin-1:batch-key-0001',
        after: {
          channel: 'email', processed: 3, sent: 2, failed: 1, skipped: 0, failedUserIds: ['u002'], interrupted: false,
          sentCount: 2, errorCount: 1, cursor: 'u004', finished: true, running: false,
        },
      },
    ])
  })

  it('keeps addresses, names and email text out of the audit', async () => {
    await post()
    const serialized = JSON.stringify(h.state.audits)
    for (const secret of ['inbox.lv', 'Klients', 'Sveiki', 'Noteikumi', '1003']) expect(serialized).not.toContain(secret)
  })

  it('counts ineligible rows as skipped and advances the cursor past them', async () => {
    // Upper-case technical domain passes the case-sensitive SQL filter but not the in-memory check.
    h.users = [client(1), client(2, { email: 'k2@CLIENT.LOCAL' })]
    const res = await post()
    expect((await res.json()).state.cursor).toBe('u002')
    expect(h.state.audits[1].after).toMatchObject({ processed: 1, sent: 1, skipped: 1 })
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('leaves the campaign unfinished after a full batch of 50', async () => {
    h.users = Array.from({ length: 51 }, (_, i) => client(i + 1))
    const body = await (await post()).json()
    expect(body.state).toMatchObject({ finished: false, cursor: 'u050', sentCount: 50 })
    const next = await (await post()).json()
    expect(next.state).toMatchObject({ finished: true, cursor: 'u051', sentCount: 51 })
    expect(h.sendEmail).toHaveBeenCalledTimes(51)
  })

  it('rolls back the claim and sends nothing when the start audit fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const res = await post()
    expect(res.status).toBe(500)
    expect(h.state).toEqual({ kv: {}, audits: [] })
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect((await post()).status).toBe(200)
  })

  it('still saves the cursor when the result audit fails after SMTP, so nothing is re-sent', async () => {
    h.appendServerAudit
      .mockImplementationOnce(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => { tx._state.audits.push({ actorId: actor.id, ...input }) })
      .mockRejectedValueOnce(new Error('audit unavailable'))
    h.users = Array.from({ length: 51 }, (_, i) => client(i + 1))

    const res = await post()

    expect(res.status).toBe(200)
    expect(campaign()).toMatchObject({ cursor: 'u050', sentCount: 50, runningSince: null })
    expect(actions()).toEqual(['card_rules_campaign.batch_started'])
    await post()
    expect(h.sendEmail).toHaveBeenCalledTimes(51)
  })

  it('records an interrupted batch and releases the lock when the run fails before SMTP', async () => {
    h.getTemplates.mockRejectedValueOnce(new Error('templates unavailable'))
    const res = await post()
    expect(res.status).toBe(500)
    expect(campaign().runningSince).toBeNull()
    expect(h.state.audits[1]).toMatchObject({ action: 'card_rules_campaign.batch_completed', after: { interrupted: true, processed: 0 } })
    expect(h.sendEmail).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/card-rules-campaign — repeats and concurrency', () => {
  it('a concurrent second run is refused as busy while the first is sending', async () => {
    let releaseSmtp = (): void => undefined
    h.sendEmail.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSmtp = resolve }))

    const first = post({}, 'run-key-00001')
    await vi.waitFor(() => expect(h.sendEmail).toHaveBeenCalledTimes(1))
    const second = await post({}, 'run-key-00002')
    releaseSmtp()
    await first

    expect(second.status).toBe(409)
    expect((await second.json()).error).toBe('busy')
    expect(h.sendEmail).toHaveBeenCalledTimes(3)
    expect(actions().filter((a) => a === 'card_rules_campaign.batch_started')).toHaveLength(1)
  })

  it('a technical retry with the same key replays the batch instead of sending the next one', async () => {
    h.users = Array.from({ length: 60 }, (_, i) => client(i + 1))
    const first = await (await post({}, 'retry-key-0001')).json()

    const retry = await (await post({}, 'retry-key-0001')).json()

    expect(retry).toEqual({ state: first.state, processed: 50, replayed: true })
    expect(h.sendEmail).toHaveBeenCalledTimes(50)
    expect(h.state.audits).toHaveLength(2)
  })

  it('a concurrent duplicate with the same key sends the batch once', async () => {
    let releaseSmtp = (): void => undefined
    h.sendEmail.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSmtp = resolve }))

    const first = post({}, 'dup-key-00001')
    await vi.waitFor(() => expect(h.sendEmail).toHaveBeenCalledTimes(1))
    const duplicate = await post({}, 'dup-key-00001')
    releaseSmtp()
    await first

    expect(duplicate.status).toBe(409)
    expect(h.sendEmail).toHaveBeenCalledTimes(3)
    expect(actions().filter((a) => a === 'card_rules_campaign.batch_started')).toHaveLength(1)
  })

  it('a stale lock older than CAMPAIGN_LOCK_MS is taken over', async () => {
    h.state.kv[CAMPAIGN_KV_KEY] = { ...IDLE, runningSince: new Date(Date.now() - 121_000).toISOString() }
    expect((await post()).status).toBe(200)
    expect(h.state.audits[0].before).toMatchObject({ running: true })
  })

  it('a fresh lock is still busy', async () => {
    h.state.kv[CAMPAIGN_KV_KEY] = { ...IDLE, runningSince: new Date(Date.now() - 1_000).toISOString() }
    const res = await post()
    expect(res.status).toBe(409)
    expect(h.state.audits).toHaveLength(0)
  })
})

describe('POST /api/admin/card-rules-campaign — reset', () => {
  it('resets the KV state and audits before/after in one transaction', async () => {
    h.state.kv[CAMPAIGN_KV_KEY] = { ...IDLE, sentCount: 7, errorCount: 1, cursor: 'u007', finished: true }
    const res = await post({ reset: true }, 'reset-key-001')
    expect(await res.json()).toEqual({ state: IDLE })
    expect(campaign()).toEqual(IDLE)
    expect(h.state.audits).toEqual([expect.objectContaining({
      action: 'card_rules_campaign.reset',
      before: { sentCount: 7, errorCount: 1, cursor: 'u007', finished: true, running: false },
      after: { sentCount: 0, errorCount: 0, cursor: null, finished: false, running: false },
    })])
  })

  it('treats a reset of an idle campaign as a no-op without an event', async () => {
    expect(await (await post({ reset: true })).json()).toEqual({ state: IDLE })
    expect(h.state.audits).toHaveLength(0)
  })

  it('a retried reset does not wipe progress made after it', async () => {
    h.state.kv[CAMPAIGN_KV_KEY] = { ...IDLE, sentCount: 7, cursor: 'u007' }
    await post({ reset: true }, 'reset-key-002')
    await post()
    const progressed = structuredClone(campaign())

    const retry = await (await post({ reset: true }, 'reset-key-002')).json()

    expect(retry.replayed).toBe(true)
    expect(campaign()).toEqual(progressed)
  })

  it('rolls the reset back when its audit fails', async () => {
    h.state.kv[CAMPAIGN_KV_KEY] = { ...IDLE, sentCount: 7, cursor: 'u007' }
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    expect((await post({ reset: true })).status).toBe(500)
    expect(campaign()).toMatchObject({ sentCount: 7, cursor: 'u007' })
  })
})
