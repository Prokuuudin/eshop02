import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Stateful harness: audit rows are staged per transaction and published on
// success; transactions run one at a time (the per-key advisory lock). SMTP is
// mocked — no real email is sent.

type Audit = { actorId: string; action: string; entityType: string; entityId: string; requestId?: string; after?: unknown }
type State = { audits: Audit[] }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  accessRequests: {} as Record<string, { status: string; email: string }>,
  requireAdminPermission: vi.fn(),
  sendEmail: vi.fn(),
  appendServerAudit: vi.fn(),
}))

function db(s: State) {
  return {
    _state: s,
    $executeRaw: async () => 0,
    auditLog: {
      findMany: async ({ where }: { where: { requestId: string; action: { in: string[] } } }) =>
        s.audits.filter((a) => a.requestId === where.requestId && where.action.in.includes(a.action)),
    },
    accessRequest: {
      findUnique: async ({ where }: { where: { id: string } }) => h.accessRequests[where.id] ?? null,
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
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
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: h.requireAdminPermission }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/mailer', () => ({ sendEmail: h.sendEmail }))
vi.mock('@/lib/email-templates-server-store', () => ({
  getTemplates: vi.fn().mockResolvedValue([
    { id: 'access-request-rejected-lv', subject: 'Par jūsu pieteikumu', body: '<p>{{name}}, pieteikums noraidīts.</p>{{note_block}}' },
  ]),
}))

import { POST } from './route'

const MANAGER = { id: 'manager-1', email: 'manager@test.com', platformRole: 'customer', teamRole: 'manager' }
const REJECT = { action: 'reject', accessRequestId: 'req1', email: 'Master@Inbox.lv', name: 'Māra Bērziņa', note: 'Nav sertifikāta', language: 'lv' }

function post(body: unknown, key?: string): Promise<Response> {
  return POST(new NextRequest('http://localhost/api/admin/card-request', {
    method: 'POST',
    body: typeof body === 'string' ? body : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
  }))
}

const actions = () => h.state.audits.map((a) => a.action)

beforeEach(() => {
  vi.clearAllMocks()
  h.queue = Promise.resolve()
  h.state = { audits: [] }
  h.accessRequests = { req1: { status: 'rejected', email: 'master@inbox.lv' }, req2: { status: 'pending', email: 'other@inbox.lv' } }
  h.requireAdminPermission.mockResolvedValue(MANAGER)
  h.sendEmail.mockResolvedValue(undefined)
  h.appendServerAudit.mockImplementation(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
    tx._state.audits.push({ actorId: actor.id, ...input })
  })
})

describe('POST /api/admin/card-request — permissions and input', () => {
  it('rejects callers without customers.read before anything is sent or audited', async () => {
    h.requireAdminPermission.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post(REJECT)).status).toBe(403)
    expect(h.requireAdminPermission).toHaveBeenCalledWith('customers.read')
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(h.state.audits).toHaveLength(0)
  })

  it.each([
    ['invalid JSON', '{', 400, 'invalid_json'],
    ['missing fields', { action: 'reject', email: 'a@b.lv' }, 422, 'missing_fields'],
    ['unknown action', { action: 'other', email: 'a@b.lv', name: 'A' }, 400, 'unknown_action'],
    ['legacy approval', { action: 'approve', email: 'a@b.lv', name: 'A', cardNumber: '1' }, 410, 'legacy_approval_disabled'],
    ['non-string request id', { ...REJECT, accessRequestId: 7 }, 422, 'invalid_access_request_id'],
  ])('keeps the %s contract without sending or auditing', async (_label, body, status, code) => {
    const res = await post(body)
    expect(res.status).toBe(status)
    expect((await res.json()).code).toBe(code)
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(h.state.audits).toHaveLength(0)
  })

  it('rejects a malformed idempotency key', async () => {
    const res = await post(REJECT, 'bad key')
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('invalid_idempotency_key')
  })

  it.each([
    ['unknown request', { accessRequestId: 'missing' }],
    ['request not rejected', { accessRequestId: 'req2', email: 'other@inbox.lv' }],
    ['email of another applicant', { email: 'someone@else.lv' }],
  ])('refuses a %s with 409 request_mismatch', async (_label, override) => {
    const res = await post({ ...REJECT, ...override })
    expect(res.status).toBe(409)
    expect((await res.json()).code).toBe('request_mismatch')
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(h.state.audits).toHaveLength(0)
  })
})

describe('POST /api/admin/card-request — rejection email', () => {
  it('audits the send before SMTP and the delivery result after it, without personal data or text', async () => {
    h.sendEmail.mockImplementation(async () => {
      expect(actions()).toEqual(['access_request.rejection_email_prepared'])
    })

    const res = await post(REJECT, 'reject-key-001')

    expect(await res.json()).toEqual({ ok: true })
    expect(h.sendEmail).toHaveBeenCalledWith('Master@Inbox.lv', 'Par jūsu pieteikumu', expect.stringContaining('Nav sertifikāta'))
    expect(h.state.audits).toEqual([
      {
        actorId: 'manager-1', action: 'access_request.rejection_email_prepared', entityType: 'access_request', entityId: 'req1',
        requestId: 'card-request-reject:manager-1:reject-key-001',
        after: { channel: 'email', language: 'lv', linked: true, hasNote: true },
      },
      {
        actorId: 'manager-1', action: 'access_request.rejection_email_recorded', entityType: 'access_request', entityId: 'req1',
        requestId: 'card-request-reject:manager-1:reject-key-001',
        after: { channel: 'email', status: 'sent' },
      },
    ])
    const serialized = JSON.stringify(h.state.audits)
    for (const secret of ['inbox.lv', 'Māra', 'Nav sertifikāta', 'noraidīts', 'Par jūsu']) expect(serialized).not.toContain(secret)
  })

  it('still sends for callers that do not pass the request id, audited as unlinked', async () => {
    const { accessRequestId: _omit, ...unlinked } = REJECT
    expect((await post(unlinked)).status).toBe(200)
    expect(h.state.audits[0]).toMatchObject({ entityId: 'unlinked', after: { linked: false } })
  })

  it('sends nothing when the audit before SMTP fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const res = await post(REJECT)
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('email_failed')
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(h.state.audits).toHaveLength(0)
  })

  it('records an SMTP failure after the prepared event and keeps the 500 contract', async () => {
    h.sendEmail.mockRejectedValueOnce(new Error('SMTP down'))
    const res = await post(REJECT, 'reject-key-002')
    expect(res.status).toBe(500)
    expect((await res.json()).code).toBe('email_failed')
    expect(h.state.audits.map((a) => [a.action, a.after])).toEqual([
      ['access_request.rejection_email_prepared', expect.anything()],
      ['access_request.rejection_email_recorded', { channel: 'email', status: 'failed' }],
    ])
  })

  it('lets the same key try again after a recorded SMTP failure', async () => {
    h.sendEmail.mockRejectedValueOnce(new Error('SMTP down'))
    await post(REJECT, 'reject-key-003')
    const retry = await post(REJECT, 'reject-key-003')
    expect(await retry.json()).toEqual({ ok: true })
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
  })

  it('keeps the response truthful when the delivery audit fails after SMTP', async () => {
    h.appendServerAudit
      .mockImplementationOnce(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => { tx._state.audits.push({ actorId: actor.id, ...input }) })
      .mockRejectedValueOnce(new Error('audit unavailable'))
    expect(await (await post(REJECT)).json()).toEqual({ ok: true })
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })
})

describe('POST /api/admin/card-request — repeats and concurrency', () => {
  it('replays a technical retry of a delivered email without sending it again', async () => {
    await post(REJECT, 'reject-key-004')
    const retry = await post(REJECT, 'reject-key-004')
    expect(await retry.json()).toEqual({ ok: true, replayed: true })
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
    expect(h.state.audits).toHaveLength(2)
  })

  it('refuses a concurrent duplicate with the same key while the first is sending', async () => {
    let releaseSmtp = (): void => undefined
    h.sendEmail.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSmtp = resolve }))

    const first = post(REJECT, 'reject-key-005')
    await vi.waitFor(() => expect(h.sendEmail).toHaveBeenCalledTimes(1))
    const duplicate = await post(REJECT, 'reject-key-005')
    releaseSmtp()
    await first

    expect(duplicate.status).toBe(409)
    expect((await duplicate.json()).code).toBe('in_progress')
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('keeps an explicit resend (new action, new key) available', async () => {
    await post(REJECT, 'reject-key-006')
    await post(REJECT, 'reject-key-007')
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
    expect(actions().filter((a) => a === 'access_request.rejection_email_recorded')).toHaveLength(2)
  })
})
