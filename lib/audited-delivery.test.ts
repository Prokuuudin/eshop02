import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Staged-transaction harness: audit rows publish only when the callback
// resolves; transactions run one at a time (the batch advisory lock).

type Audit = { actorId: string; action: string; entityType: string; entityId: string; requestId?: string; after?: unknown }

const h = vi.hoisted(() => ({
  audits: [] as Audit[],
  queue: Promise.resolve() as Promise<unknown>,
  appendServerAudit: vi.fn(),
  logApiError: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: h.logApiError }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
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

import { prepareAuditedDelivery, recordAuditedDelivery } from './audited-delivery'

const actor = { id: 'admin-1', email: 'admin@test.com' } as never
const request = new NextRequest('http://localhost/api/admin/broadcast', { method: 'POST' })
const actions = { prepared: 'x.prepared', recorded: 'x.recorded' }
const target = { entityType: 'x', entityId: 'batch-1' }
const prepare = (retryable = (result: unknown) => (result as { status?: string }).status === 'failed') =>
  prepareAuditedDelivery({ request, actor, batchId: 'batch-1', actions, target, after: { channel: 'email', count: 2 }, retryable })
const record = (status: string) => recordAuditedDelivery({ request, actor, batchId: 'batch-1', actions, target, result: { channel: 'email', status } })

beforeEach(() => {
  vi.clearAllMocks()
  h.audits = []
  h.queue = Promise.resolve()
  h.appendServerAudit.mockImplementation(async (tx: { _audits: Audit[] }, _req: NextRequest, sessionActor: { id: string }, input: Omit<Audit, 'actorId'>) => {
    tx._audits.push({ actorId: sessionActor.id, ...input })
  })
})

describe('audited delivery', () => {
  it('commits the prepared event under the batch request id', async () => {
    expect(await prepare()).toEqual({ kind: 'prepared' })
    expect(h.audits).toEqual([{ actorId: 'admin-1', action: 'x.prepared', entityType: 'x', entityId: 'batch-1', requestId: 'batch-1', after: { channel: 'email', count: 2 } }])
  })

  it('reports a claim without an outcome as in progress, even when the outcome could not be written', async () => {
    await prepare()
    expect(await prepare()).toEqual({ kind: 'in_progress' })
    expect(h.audits).toHaveLength(1)
  })

  it('replays a recorded outcome that is not retryable', async () => {
    await prepare()
    await record('sent')
    expect(await prepare()).toEqual({ kind: 'replay', prepared: { channel: 'email', count: 2 }, result: { channel: 'email', status: 'sent' } })
    expect(h.audits).toHaveLength(2)
  })

  it('allows a new attempt under the same key after a retryable outcome', async () => {
    await prepare()
    await record('failed')
    expect(await prepare()).toEqual({ kind: 'prepared' })
    expect(h.audits.map((a) => a.action)).toEqual(['x.prepared', 'x.recorded', 'x.prepared'])
  })

  it('serialises concurrent claims: exactly one is prepared', async () => {
    const claims = await Promise.all([prepare(), prepare()])
    expect(claims.map((c) => c.kind).sort()).toEqual(['in_progress', 'prepared'])
  })

  it('writes nothing when the prepared audit fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    await expect(prepare()).rejects.toThrow('audit unavailable')
    expect(h.audits).toHaveLength(0)
  })

  it('retries the outcome once and reports whether it was recorded', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('blip'))
    expect(await record('sent')).toBe(true)
    h.appendServerAudit.mockRejectedValueOnce(new Error('down')).mockRejectedValueOnce(new Error('down'))
    expect(await record('sent')).toBe(false)
    expect(h.logApiError).toHaveBeenCalledWith('audited_delivery_result_not_recorded', expect.any(Error))
  })
})
