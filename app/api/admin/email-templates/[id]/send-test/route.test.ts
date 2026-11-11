import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Staged-transaction harness for audit rows (one transaction at a time, as the
// batch advisory lock guarantees). SMTP is mocked — no email is sent.

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
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn() }))
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

import { getTemplates } from '@/lib/email-templates-server-store'
import { sendEmail } from '@/lib/mailer'
import { requireAdmin } from '@/lib/server-auth'
import { POST } from './route'

const invoke = (to = 'admin@test.com', key?: string) => POST(
  new NextRequest('https://shop.test/api/admin/email-templates/password-reset-en/send-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
    body: JSON.stringify({ to }),
  }),
  { params: Promise.resolve({ id: 'password-reset-en' }) },
)
const writeAudit = async (tx: { _audits: Audit[] }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
  tx._audits.push({ actorId: actor.id, ...input })
}

beforeEach(() => {
  vi.clearAllMocks()
  h.audits = []
  h.queue = Promise.resolve()
  h.appendServerAudit.mockImplementation(writeAudit)
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin', email: 'Admin@Test.com' } as never)
  vi.mocked(sendEmail).mockResolvedValue(undefined)
  vi.mocked(getTemplates).mockResolvedValue([{
    id: 'password-reset-en',
    name: 'Reset EN',
    subject: 'Reset {{order_id}}',
    body: '<a href="{{reset_link}}">Reset</a><p>{{email}}</p>',
    variables: ['order_id', 'reset_link', 'email'],
  }] as never)
})

describe('POST /api/admin/email-templates/:id/send-test', () => {
  it('requires admin authorization and validates the destination', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await invoke()).status).toBe(403)
    expect(sendEmail).not.toHaveBeenCalled()

    vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin', email: 'admin@test.com' } as never)
    expect((await invoke('not-an-email')).status).toBe(400)
    expect(h.audits).toHaveLength(0)
  })

  it('renders every declared placeholder and only sends sample personal data to the requested admin', async () => {
    const res = await invoke()
    expect(res.status).toBe(200)
    expect(sendEmail).toHaveBeenCalledOnce()
    const [to, subject, html] = vi.mocked(sendEmail).mock.calls[0]
    expect(to).toBe('admin@test.com')
    expect(subject).toContain('ORD-2025-001')
    expect(html).not.toMatch(/\{\{\w+\}\}/)
    expect(html).toContain('ivan@example.com')
    expect(html).toContain('href="#"')
  })

  it('does not deliver unknown templates or hide SMTP failure', async () => {
    vi.mocked(getTemplates).mockResolvedValue([])
    expect((await invoke()).status).toBe(404)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(h.audits).toHaveLength(0)

    vi.mocked(getTemplates).mockResolvedValue([{
      id: 'password-reset-en', name: 'Reset', subject: 'S', body: 'B', variables: [],
    }] as never)
    vi.mocked(sendEmail).mockRejectedValue(new Error('smtp down'))
    expect((await invoke()).status).toBe(500)
  })

  it('rejects a malformed idempotency key', async () => {
    const res = await invoke('admin@test.com', 'bad key')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_idempotency_key')
  })

  it('audits the template ID and counts before SMTP and the status after it, without address or content', async () => {
    vi.mocked(sendEmail).mockImplementation(async () => {
      expect(h.audits.map((a) => a.action)).toEqual(['email_template.test_prepared'])
    })

    await invoke('admin@test.com', 'test-key-0001')

    expect(h.audits).toEqual([
      {
        actorId: 'admin', action: 'email_template.test_prepared', entityType: 'email_template', entityId: 'password-reset-en',
        requestId: 'email-template-test:admin:test-key-0001',
        after: { channel: 'email', variables: 3, recipientIsActor: true },
      },
      {
        actorId: 'admin', action: 'email_template.test_recorded', entityType: 'email_template', entityId: 'password-reset-en',
        requestId: 'email-template-test:admin:test-key-0001',
        after: { channel: 'email', status: 'sent' },
      },
    ])
    const serialized = JSON.stringify(h.audits)
    for (const secret of ['test.com', 'Reset', 'ORD-2025-001', 'ivan@example.com', '[Тест]']) expect(serialized).not.toContain(secret)
  })

  it('sends nothing when the audit before SMTP fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const res = await invoke()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('send_failed')
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('records an SMTP failure; the same key may try again', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('smtp down'))
    expect((await invoke('ops@shop.lv', 'test-key-0002')).status).toBe(500)
    expect(h.audits.at(-1)?.after).toEqual({ channel: 'email', status: 'failed' })

    expect(await (await invoke('ops@shop.lv', 'test-key-0002')).json()).toEqual({ ok: true })
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })

  it('replays a delivered test email instead of sending it again', async () => {
    await invoke('ops@shop.lv', 'test-key-0003')
    expect(await (await invoke('ops@shop.lv', 'test-key-0003')).json()).toEqual({ ok: true, replayed: true })
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('never resends when recording the outcome failed', async () => {
    h.appendServerAudit
      .mockImplementationOnce(writeAudit)
      .mockRejectedValueOnce(new Error('audit down'))
      .mockRejectedValueOnce(new Error('audit down'))
    expect(await (await invoke('ops@shop.lv', 'test-key-0004')).json()).toEqual({ ok: true })

    const retry = await invoke('ops@shop.lv', 'test-key-0004')

    expect(retry.status).toBe(409)
    expect((await retry.json()).error).toBe('in_progress')
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('a concurrent duplicate with the same key sends once', async () => {
    let releaseSmtp = (): void => undefined
    vi.mocked(sendEmail).mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSmtp = resolve }))

    const first = invoke('ops@shop.lv', 'test-key-0005')
    await vi.waitFor(() => expect(sendEmail).toHaveBeenCalledTimes(1))
    const duplicate = await invoke('ops@shop.lv', 'test-key-0005')
    releaseSmtp()
    await first

    expect(duplicate.status).toBe(409)
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('keeps an explicit resend (new action, new key) available', async () => {
    await invoke('ops@shop.lv', 'test-key-0006')
    await invoke('ops@shop.lv', 'test-key-0007')
    expect(sendEmail).toHaveBeenCalledTimes(2)
  })
})
