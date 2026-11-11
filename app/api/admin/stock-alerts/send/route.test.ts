import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

// Staged-transaction harness for audit rows; SMTP is mocked — nothing is sent.

type Audit = { actorId: string; action: string; entityType: string; entityId: string; requestId?: string; after?: unknown }

const h = vi.hoisted(() => ({
  audits: [] as Audit[],
  queue: Promise.resolve() as Promise<unknown>,
  appendServerAudit: vi.fn(),
  requireAdmin: vi.fn(),
  sendEmail: vi.fn(),
  productFindMany: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: h.requireAdmin }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/mailer', () => ({ sendEmail: h.sendEmail }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    product: { findMany: h.productFindMany },
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

import { POST } from './route'

const ADMIN = { id: 'admin-1', email: 'Admin@Test.com', platformRole: 'admin' }
const PRODUCTS = [
  { id: 'p1', title: 'Secret Shampoo', brand: 'BrandX', sku: 'SKU-001', category: 'hair', stock: 0, price: 12.5 },
  { id: 'p2', title: 'Rare Mask', brand: 'BrandY', sku: null, category: 'face', stock: 3, price: 20 },
]
const writeAudit = async (tx: { _audits: Audit[] }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
  tx._audits.push({ actorId: actor.id, ...input })
}

function post(body: unknown, key?: string): Promise<Response> {
  return POST(new NextRequest('http://localhost/api/admin/stock-alerts/send', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...(key ? { 'Idempotency-Key': key } : {}) },
  }))
}
const actions = () => h.audits.map((a) => a.action)

beforeEach(() => {
  vi.clearAllMocks()
  h.audits = []
  h.queue = Promise.resolve()
  h.requireAdmin.mockResolvedValue(ADMIN)
  h.sendEmail.mockResolvedValue(undefined)
  h.productFindMany.mockResolvedValue(PRODUCTS)
  h.appendServerAudit.mockImplementation(writeAudit)
})

describe('POST /api/admin/stock-alerts/send', () => {
  it('rejects non-admins before querying, auditing or sending', async () => {
    h.requireAdmin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await post({ to: 'ops@shop.lv' })).status).toBe(403)
    expect(h.productFindMany).not.toHaveBeenCalled()
    expect(h.sendEmail).not.toHaveBeenCalled()
    expect(h.audits).toHaveLength(0)
  })

  it.each([['missing'], ['not-an-email'], ['two words@x.lv']])('rejects the address %s', async (to) => {
    const res = await post({ to: to === 'missing' ? undefined : to })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_email')
    expect(h.audits).toHaveLength(0)
  })

  it('rejects a malformed idempotency key', async () => {
    const res = await post({ to: 'ops@shop.lv' }, 'bad key')
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_idempotency_key')
  })

  it('keeps the threshold rules and the response contract', async () => {
    const res = await post({ to: 'ops@shop.lv', threshold: 3.9 })
    expect(await res.json()).toEqual({ ok: true, sent: 2 })
    expect(h.productFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { isDeleted: false, stock: { gte: 0, lte: 3 } } }))
  })

  it('audits counts before SMTP and the outcome after it, without the address or report content', async () => {
    h.sendEmail.mockImplementation(async () => {
      expect(actions()).toEqual(['stock_alert.report_prepared'])
    })

    await post({ to: 'admin@test.com', threshold: 5 }, 'report-key-001')

    expect(h.audits).toEqual([
      {
        actorId: 'admin-1', action: 'stock_alert.report_prepared', entityType: 'stock_alert_report',
        entityId: 'stock-alert-report:admin-1:report-key-001', requestId: 'stock-alert-report:admin-1:report-key-001',
        after: { channel: 'email', threshold: 5, products: 2, outOfStock: 1, lowStock: 1, recipientIsActor: true },
      },
      {
        actorId: 'admin-1', action: 'stock_alert.report_recorded', entityType: 'stock_alert_report',
        entityId: 'stock-alert-report:admin-1:report-key-001', requestId: 'stock-alert-report:admin-1:report-key-001',
        after: { channel: 'email', status: 'sent' },
      },
    ])
    const serialized = JSON.stringify(h.audits)
    for (const secret of ['test.com', 'Secret Shampoo', 'BrandX', 'SKU-001', 'Остатки']) expect(serialized).not.toContain(secret)
  })

  it('sends nothing when the audit before SMTP fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const res = await post({ to: 'ops@shop.lv' })
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('send_failed')
    expect(h.sendEmail).not.toHaveBeenCalled()
  })

  it('records an SMTP failure and keeps the 500 contract; the same key may try again', async () => {
    h.sendEmail.mockRejectedValueOnce(new Error('SMTP down'))
    const failed = await post({ to: 'ops@shop.lv' }, 'report-key-002')
    expect(failed.status).toBe(500)
    expect((await failed.json()).error).toBe('send_failed')
    expect(h.audits.at(-1)?.after).toEqual({ channel: 'email', status: 'failed' })

    const retry = await post({ to: 'ops@shop.lv' }, 'report-key-002')
    expect(await retry.json()).toEqual({ ok: true, sent: 2 })
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
  })

  it('replays a delivered report on a technical retry without sending it again', async () => {
    await post({ to: 'ops@shop.lv' }, 'report-key-003')
    const retry = await post({ to: 'ops@shop.lv' }, 'report-key-003')
    expect(await retry.json()).toEqual({ ok: true, sent: 2, replayed: true })
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('never resends a delivered report when recording the outcome failed', async () => {
    h.appendServerAudit
      .mockImplementationOnce(writeAudit)
      .mockRejectedValueOnce(new Error('audit down'))
      .mockRejectedValueOnce(new Error('audit down'))
    expect(await (await post({ to: 'ops@shop.lv' }, 'report-key-004')).json()).toEqual({ ok: true, sent: 2 })

    const retry = await post({ to: 'ops@shop.lv' }, 'report-key-004')

    expect(retry.status).toBe(409)
    expect((await retry.json()).error).toBe('in_progress')
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('a concurrent duplicate with the same key sends once', async () => {
    let releaseSmtp = (): void => undefined
    h.sendEmail.mockImplementationOnce(() => new Promise<void>((resolve) => { releaseSmtp = resolve }))

    const first = post({ to: 'ops@shop.lv' }, 'report-key-005')
    await vi.waitFor(() => expect(h.sendEmail).toHaveBeenCalledTimes(1))
    const duplicate = await post({ to: 'ops@shop.lv' }, 'report-key-005')
    releaseSmtp()
    await first

    expect(duplicate.status).toBe(409)
    expect(h.sendEmail).toHaveBeenCalledTimes(1)
  })

  it('keeps an explicit resend (new action, new key) available', async () => {
    await post({ to: 'ops@shop.lv' }, 'report-key-006')
    await post({ to: 'ops@shop.lv' }, 'report-key-007')
    expect(h.sendEmail).toHaveBeenCalledTimes(2)
  })
})
