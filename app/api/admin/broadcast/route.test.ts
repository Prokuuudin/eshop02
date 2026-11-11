import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Staged-transaction harness for the audit rows (published only on success,
// one transaction at a time, as the batch advisory lock guarantees). SMTP is
// mocked — no real email is sent.

type Audit = { actorId: string; action: string; entityType: string; entityId: string; requestId?: string; after?: unknown }

const h = vi.hoisted(() => ({
  audits: [] as Audit[],
  queue: Promise.resolve() as Promise<unknown>,
  appendServerAudit: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://shop.test') }))
vi.mock('@/lib/newsletter-store', () => ({
  getMarketingOptedOutSet: vi.fn(),
  marketingUnsubUrl: vi.fn((email: string) => `https://shop.test/api/newsletter/unsubscribe?email=${encodeURIComponent(email)}&token=signed`),
}))
vi.mock('@/lib/admin/customer-segments', () => ({
  CUSTOMER_SEGMENTS: ['vip', 'regular', 'new', 'inactive'],
  getCustomerRecipients: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: async (run: (tx: unknown) => Promise<unknown>) => {
      const previous = h.queue
      let release = (): void => undefined
      h.queue = new Promise<void>((resolve) => { release = resolve })
      await previous
      try {
        const staged = structuredClone(h.audits)
        const tx = {
          _audits: staged,
          $executeRaw: async () => 0,
          auditLog: {
            findMany: async ({ where }: { where: { requestId: string; action: { in: string[] } } }) =>
              staged.filter((a) => a.requestId === where.requestId && where.action.in.includes(a.action)),
          },
        }
        const result = await run(tx)
        h.audits = staged
        return result
      } finally {
        release()
      }
    },
  },
}))

import { sendEmail } from '@/lib/mailer'
import { getMarketingOptedOutSet, marketingUnsubUrl } from '@/lib/newsletter-store'
import { requireAdmin } from '@/lib/server-auth'
import { POST } from './route'
import { getCustomerRecipients } from '@/lib/admin/customer-segments'

type Recipient = { email: string; firstName: string; lastName: string }

function send(payload: Record<string, unknown>, key?: string): Promise<Response> {
  return POST(new NextRequest('https://shop.test/api/admin/broadcast', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify(payload),
  }))
}
const request = (recipients: Recipient[], key?: string) =>
  send({ recipients, subject: 'Hello {first_name}', body: 'Private message for {first_name} {last_name}' }, key)

const THREE: Recipient[] = [
  { email: 'opted@test.com', firstName: 'Opted', lastName: 'Out' },
  { email: 'fail@test.com', firstName: 'Fail', lastName: 'One' },
  { email: 'ok@test.com', firstName: 'Ok', lastName: 'Two' },
]
const actions = () => h.audits.map((a) => a.action)
const writeAudit = async (tx: { _audits: Audit[] }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
  tx._audits.push({ actorId: actor.id, ...input })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.audits = []
  h.queue = Promise.resolve()
  h.appendServerAudit.mockImplementation(writeAudit)
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin', email: 'admin@test.com' } as never)
  vi.mocked(getMarketingOptedOutSet).mockResolvedValue(new Set())
  vi.mocked(sendEmail).mockResolvedValue(undefined)
  vi.mocked(getCustomerRecipients).mockResolvedValue([])
})

describe('POST /api/admin/broadcast email lifecycle', () => {
  it('requires admin authorization before delivery', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await request([{ email: 'a@test.com', firstName: 'A', lastName: 'One' }])
    expect(res.status).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(h.audits).toHaveLength(0)
  })

  it('personalizes each delivery without leaking another recipient and includes signed unsubscribe metadata', async () => {
    await request([
      { email: 'anna@test.com', firstName: 'Anna', lastName: 'One' },
      { email: 'boris@test.com', firstName: 'Boris', lastName: 'Two' },
    ])

    expect(sendEmail).toHaveBeenCalledTimes(2)
    const anna = vi.mocked(sendEmail).mock.calls.find(([to]) => to === 'anna@test.com')!
    expect(anna[1]).toBe('Hello Anna')
    expect(anna[2]).toContain('Private message for Anna One')
    expect(anna[2]).not.toContain('Boris')
    expect(anna[2]).not.toContain('boris@test.com')
    expect(anna[2]).toContain('token=signed')
    expect(anna[3]).toEqual({ listUnsubscribeUrl: expect.stringContaining('token=signed') })
    expect(marketingUnsubUrl).toHaveBeenCalledWith('anna@test.com', 'https://shop.test')
  })

  it('honours opt-out and reports partial SMTP failures without retrying other recipients twice', async () => {
    vi.mocked(getMarketingOptedOutSet).mockResolvedValue(new Set(['opted@test.com']))
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('smtp down')).mockResolvedValueOnce(undefined)

    const res = await request(THREE)

    expect(await res.json()).toEqual({ ok: true, sent: 1, failed: 1, skipped: 1, failedEmails: ['fail@test.com'] })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(sendEmail).not.toHaveBeenCalledWith('opted@test.com', expect.anything(), expect.anything(), expect.anything())
  })

  it('resolves a segment audience on the server instead of trusting browser-supplied recipients', async () => {
    vi.mocked(getCustomerRecipients).mockResolvedValue([{ email: 'vip@test.com', firstName: 'V', lastName: 'IP' }])
    const res = await send({ audience: { segment: 'vip' }, recipients: [{ email: 'attacker@test.com', firstName: '', lastName: '' }], subject: 'Hi', body: 'Text' })
    expect(res.status).toBe(200)
    expect(getCustomerRecipients).toHaveBeenCalledWith('vip', 501)
    expect(sendEmail).toHaveBeenCalledWith('vip@test.com', expect.anything(), expect.anything(), expect.anything())
    expect(sendEmail).not.toHaveBeenCalledWith('attacker@test.com', expect.anything(), expect.anything(), expect.anything())
  })
})

describe('POST /api/admin/broadcast — input', () => {
  const one = [{ email: 'a@test.com', firstName: 'A', lastName: 'One' }]
  it.each([
    ['invalid segment', { audience: { segment: 'everyone' }, subject: 'S', body: 'B' }, 'invalid_segment'],
    ['missing subject', { recipients: one, subject: ' ', body: 'B' }, 'subject_required'],
    ['missing body', { recipients: one, subject: 'S', body: '' }, 'body_required'],
    ['no valid recipients', { recipients: [{ email: 'not-an-email', firstName: '', lastName: '' }], subject: 'S', body: 'B' }, 'no_recipients'],
    ['too many recipients', { recipients: Array.from({ length: 501 }, (_, i) => ({ email: `r${i}@test.com`, firstName: '', lastName: '' })), subject: 'S', body: 'B' }, 'too_many_recipients'],
  ])('rejects %s without auditing or sending', async (_label, payload, error) => {
    const res = await send(payload)
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe(error)
    expect(h.audits).toHaveLength(0)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('rejects a malformed idempotency key', async () => {
    const res = await request(one, 'bad key')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_idempotency_key')
    expect(sendEmail).not.toHaveBeenCalled()
  })
})

describe('POST /api/admin/broadcast — audit', () => {
  it('audits the preparation before SMTP and the outcome after it, with counts only', async () => {
    vi.mocked(getMarketingOptedOutSet).mockResolvedValue(new Set(['opted@test.com']))
    vi.mocked(sendEmail).mockImplementation(async (to: string) => {
      expect(actions()).toEqual(['broadcast.prepared'])
      if (to === 'fail@test.com') throw new Error('smtp down')
    })

    await request(THREE, 'bcast-key-0001')

    expect(h.audits).toEqual([
      {
        actorId: 'admin', action: 'broadcast.prepared', entityType: 'broadcast', entityId: 'broadcast:admin:bcast-key-0001',
        requestId: 'broadcast:admin:bcast-key-0001',
        after: { channel: 'email', audience: 'manual', segment: null, recipients: 3, optedOut: 1 },
      },
      {
        actorId: 'admin', action: 'broadcast.delivery_recorded', entityType: 'broadcast', entityId: 'broadcast:admin:bcast-key-0001',
        requestId: 'broadcast:admin:bcast-key-0001',
        after: { channel: 'email', sent: 1, failed: 1, skipped: 1 },
      },
    ])
    const serialized = JSON.stringify(h.audits)
    for (const secret of ['@test.com', 'Hello', 'Private message', 'Fail', 'unsubscribe']) expect(serialized).not.toContain(secret)
  })

  it('records the segment name for a server-resolved audience', async () => {
    vi.mocked(getCustomerRecipients).mockResolvedValue([{ email: 'vip@test.com', firstName: 'V', lastName: 'IP' }])
    await send({ audience: {}, subject: 'Hi', body: 'Text' })
    expect(h.audits[0].after).toMatchObject({ audience: 'segment', segment: 'all', recipients: 1 })
  })

  it('sends nothing when the audit before SMTP fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const res = await request(THREE)
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('internal_error')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('a failure to record the outcome keeps the response and never lets a retry resend', async () => {
    h.appendServerAudit
      .mockImplementationOnce(writeAudit)
      .mockRejectedValueOnce(new Error('audit down'))
      .mockRejectedValueOnce(new Error('audit down'))

    const first = await request(THREE, 'bcast-key-0002')
    expect(await first.json()).toMatchObject({ ok: true, sent: 3 })

    const retry = await request(THREE, 'bcast-key-0002')
    expect(retry.status).toBe(409)
    expect((await retry.json()).error).toBe('in_progress')
    expect(sendEmail).toHaveBeenCalledTimes(3)
  })
})

describe('POST /api/admin/broadcast — repeats and concurrency', () => {
  it('replays a technical retry from the recorded counts without sending again', async () => {
    vi.mocked(getMarketingOptedOutSet).mockResolvedValue(new Set(['opted@test.com']))
    await request(THREE, 'bcast-key-0003')
    const retry = await request(THREE, 'bcast-key-0003')
    expect(await retry.json()).toEqual({ ok: true, sent: 2, failed: 0, skipped: 1, failedEmails: [], replayed: true })
    expect(sendEmail).toHaveBeenCalledTimes(2)
    expect(h.audits).toHaveLength(2)
  })

  it('a concurrent duplicate with the same key sends each email once', async () => {
    let releaseSmtp = (): void => undefined
    vi.mocked(sendEmail).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSmtp = resolve }))

    const first = request(THREE, 'bcast-key-0004')
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1))
    const duplicate = await request(THREE, 'bcast-key-0004')
    releaseSmtp()
    await first

    expect(duplicate.status).toBe(409)
    expect(sendEmail).toHaveBeenCalledTimes(3)
    expect(actions().filter((a) => a === 'broadcast.prepared')).toHaveLength(1)
  })

  it('lets the same key try again when nothing was delivered', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('smtp down'))
    await request(THREE, 'bcast-key-0005')
    vi.mocked(sendEmail).mockResolvedValue(undefined)

    const retry = await request(THREE, 'bcast-key-0005')

    expect(await retry.json()).toMatchObject({ ok: true, sent: 3, failed: 0 })
    expect(actions()).toEqual(['broadcast.prepared', 'broadcast.delivery_recorded', 'broadcast.prepared', 'broadcast.delivery_recorded'])
  })

  it('keeps an explicit resend (new action, new key) available', async () => {
    await request(THREE, 'bcast-key-0006')
    await request(THREE, 'bcast-key-0007')
    expect(sendEmail).toHaveBeenCalledTimes(6)
  })
})
