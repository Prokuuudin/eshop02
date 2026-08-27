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
      const run = state.queue.then(() => cb(client))
      state.queue = run.then(
        () => undefined,
        () => undefined
      )
      return run
    }),
  }
  return { prisma: client }
})

import { prisma } from '@/lib/prisma'
import { getTemplates, upsertTemplate, type EmailTemplate } from '@/lib/email-templates-server-store'

beforeEach(() => {
  state.rows.clear()
  state.queue = Promise.resolve()
  vi.clearAllMocks()
})

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
    const result = await upsertTemplate('missing', { subject: 'x' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('not_found')
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('performs the read-modify-write inside a single advisory-locked transaction', async () => {
    seedTemplates([tmplA, tmplB])

    const result = await upsertTemplate('order-confirmation-ru', { subject: 'Edited subject' })

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
      upsertTemplate('order-confirmation-ru', { subject: 'Edited by admin A' }),
      upsertTemplate('password-reset-ru', { subject: 'Edited by admin B' }),
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
})
