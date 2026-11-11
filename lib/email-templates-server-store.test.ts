import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { describe, expect, it, vi, beforeEach } from 'vitest'

// In-memory stand-in for the single shared `email-templates` KeyValueSetting row,
// plus a queue that models what `pg_advisory_xact_lock(hashtext(KV_KEY))` gives you
// in real Postgres: because the lock is the very first statement inside the
// transaction and is held until commit, the whole remainder of one transaction
// always finishes (read, modify, write, commit-and-release) before a second
// transaction taking the same lock can start its own read. `$transaction` below
// queues whole callback executions to reproduce exactly that ordering guarantee.
const state = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  queue: Promise.resolve() as Promise<unknown>,
  audits: [] as Array<{ actorId: string; input: Record<string, unknown> }>,
  failAudit: false,
}))

vi.mock('@/lib/prisma', () => {
  const client = {
    keyValueSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        state.rows.has(where.key)
          ? { key: where.key, value: state.rows.get(where.key), updatedAt: new Date() }
          : null
      ),
      upsert: vi.fn(
        async ({
          where,
          create,
          update,
        }: {
          where: { key: string }
          create: { value: unknown }
          update: { value: unknown }
        }) => {
          state.rows.set(where.key, state.rows.has(where.key) ? update.value : create.value)
          return { key: where.key, value: state.rows.get(where.key), updatedAt: new Date() }
        }
      ),
    },
    $executeRaw: vi.fn(async () => undefined),
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => {
      const run = state.queue.then(async () => {
        const rows = structuredClone(state.rows)
        const audits = structuredClone(state.audits)
        try {
          return await cb(client)
        } catch (error) {
          state.rows = rows
          state.audits = audits
          throw error
        }
      })
      state.queue = run.then(
        () => undefined,
        () => undefined
      )
      return run
    }),
  }
  return { prisma: client }
})

vi.mock('@/lib/server-audit', () => ({
  appendServerAudit: vi.fn(async (_tx: unknown, _request: unknown, actor: { id: string }, input: Record<string, unknown>) => {
    if (state.failAudit) throw new Error('audit unavailable')
    state.audits.push({ actorId: actor.id, input })
  }),
}))

import { prisma } from '@/lib/prisma'
import { getTemplates, upsertTemplate, type EmailTemplate } from '@/lib/email-templates-server-store'

beforeEach(() => {
  state.rows.clear()
  state.queue = Promise.resolve()
  state.audits = []
  state.failAudit = false
  vi.clearAllMocks()
})

const actor = { id: 'admin-1', email: 'admin@example.test' }
const request = new NextRequest('https://shop.test/api/admin/email-templates/order-confirmation-ru', { method: 'PUT' })
const audit = { actor, request } as never
const sha = (value: string): string => createHash('sha256').update(value).digest('hex')

const tmplA: EmailTemplate = {
  id: 'order-confirmation-ru',
  name: 'Order confirmation',
  subject: 'Original A subject',
  body: 'Body A',
  variables: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const tmplB: EmailTemplate = {
  id: 'password-reset-ru',
  name: 'Password reset',
  subject: 'Original B subject',
  body: 'Body B',
  variables: [],
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function seedTemplates(templates: EmailTemplate[]): void {
  state.rows.set('email-templates', { templates })
}

describe('upsertTemplate', () => {
  it('returns not_found for an unknown template id without writing', async () => {
    seedTemplates([tmplA, tmplB])
    const result = await upsertTemplate('missing', { subject: 'x' }, audit)
    expect(result.success).toBe(false)
    expect(result.error).toBe('not_found')
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('performs the read-modify-write inside a single advisory-locked transaction', async () => {
    seedTemplates([tmplA, tmplB])

    const result = await upsertTemplate('order-confirmation-ru', { subject: 'Edited subject' }, audit)

    expect(result.success).toBe(true)
    expect(result.template?.subject).toBe('Edited subject')
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)

    // The lock call must be keyed on this store's own KV key ('email-templates'),
    // not a literal shared with unrelated locks elsewhere (e.g. server-audit.ts's
    // 203948721), so editing templates never serializes against unrelated writers.
    const [strings, ...values] = vi.mocked(prisma.$executeRaw).mock.calls[0] as [
      TemplateStringsArray,
      ...unknown[],
    ]
    expect(strings.join('')).toContain('pg_advisory_xact_lock(hashtext(')
    expect(values).toEqual(['email-templates'])
  })

  it('regression: two admins editing different templates at the same time both keep their edit', async () => {
    // This is the exact race the missing lock allowed: both requests read the shared
    // KV row before either had written, so whichever write landed second silently
    // dropped the other admin's edit even though the two edits touched different
    // templates entirely.
    seedTemplates([tmplA, tmplB])

    const [resultA, resultB] = await Promise.all([
      upsertTemplate('order-confirmation-ru', { subject: 'Edited by admin A' }, audit),
      upsertTemplate('password-reset-ru', { subject: 'Edited by admin B' }, audit),
    ])

    expect(resultA.success).toBe(true)
    expect(resultA.template?.subject).toBe('Edited by admin A')
    expect(resultB.success).toBe(true)
    expect(resultB.template?.subject).toBe('Edited by admin B')

    // Both concurrent writers must have gone through the locked-transaction path.
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2)

    const templates = await getTemplates()
    expect(templates).toHaveLength(2)
    expect(templates.find((t) => t.id === 'order-confirmation-ru')?.subject).toBe('Edited by admin A')
    expect(templates.find((t) => t.id === 'password-reset-ru')?.subject).toBe('Edited by admin B')
  })

  it('audits only changed field names, sizes and hashes without template text', async () => {
    seedTemplates([tmplA, tmplB])
    const before = (await getTemplates()).find((template) => template.id === 'order-confirmation-ru')!

    await upsertTemplate('order-confirmation-ru', {
      subject: 'Secret changed subject', body: 'Secret changed body', variables: ['customerName'],
    }, audit)

    expect(state.audits).toEqual([{ actorId: 'admin-1', input: {
      action: 'email_template.updated', entityType: 'email_template',
      entityId: 'order-confirmation-ru', entityTitle: 'order-confirmation-ru',
      before: { fields: [
        { field: 'subject', bytes: Buffer.byteLength(before.subject), sha256: sha(before.subject) },
        { field: 'body', bytes: Buffer.byteLength(before.body), sha256: sha(before.body) },
        { field: 'variables', bytes: Buffer.byteLength(JSON.stringify(before.variables)), sha256: sha(JSON.stringify(before.variables)) },
      ] },
      after: { fields: [
        { field: 'subject', bytes: Buffer.byteLength('Secret changed subject'), sha256: sha('Secret changed subject') },
        { field: 'body', bytes: Buffer.byteLength('Secret changed body'), sha256: sha('Secret changed body') },
        { field: 'variables', bytes: Buffer.byteLength('["customerName"]'), sha256: sha('["customerName"]') },
      ] },
    } }])
    expect(JSON.stringify(state.audits)).not.toContain('Secret changed')
  })

  it('returns the existing template without a write or event for an identical update', async () => {
    seedTemplates([tmplA, tmplB])
    const current = (await getTemplates()).find((template) => template.id === 'order-confirmation-ru')!

    const result = await upsertTemplate('order-confirmation-ru', {
      name: current.name, subject: current.subject, body: current.body, variables: current.variables,
    }, audit)

    expect(result).toEqual({ success: true, template: current })
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
    expect(state.audits).toEqual([])
  })

  it('rolls the template update back when audit append fails', async () => {
    seedTemplates([tmplA, tmplB])
    state.failAudit = true

    await expect(upsertTemplate('order-confirmation-ru', { subject: 'Must roll back' }, audit))
      .resolves.toEqual({ success: false, error: 'write_failed' })

    expect((state.rows.get('email-templates') as { templates: EmailTemplate[] }).templates[0].subject).toBe(tmplA.subject)
    expect(state.audits).toEqual([])
  })

  it('records one event for concurrent duplicate updates', async () => {
    seedTemplates([tmplA, tmplB])

    const results = await Promise.all([
      upsertTemplate('order-confirmation-ru', { subject: 'Same subject' }, audit),
      upsertTemplate('order-confirmation-ru', { subject: 'Same subject' }, audit),
    ])

    expect(results.every((result) => result.success)).toBe(true)
    expect(state.audits).toHaveLength(1)
  })
})
