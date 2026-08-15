import { describe, expect, it, vi, beforeEach } from 'vitest'

// Same queueing model as email-templates-server-store.test.ts: `$transaction` here
// serializes whole callback executions, reproducing what `pg_advisory_xact_lock`
// guarantees in real Postgres for this store's single shared KV row.
const state = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  queue: Promise.resolve() as Promise<unknown>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const client = {
    keyValueSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        state.rows.has(where.key) ? { key: where.key, value: state.rows.get(where.key) } : null
      ),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        state.rows.set(where.key, state.rows.has(where.key) ? update.value : create.value)
        return { key: where.key, value: state.rows.get(where.key) }
      }),
    },
    $executeRaw: vi.fn(async () => undefined),
    $transaction: vi.fn((cb: (tx: unknown) => unknown) => {
      const run = state.queue.then(() => cb(client))
      state.queue = run.then(() => undefined, () => undefined)
      return run
    }),
  }
  return { prisma: client }
})

import { prisma } from '@/lib/prisma'
import { getLocaleConfig, saveLocaleConfig, saveLocaleConfigTx } from './locale-config-server-store'

beforeEach(() => {
  state.rows.clear()
  state.queue = Promise.resolve()
  vi.clearAllMocks()
})

describe('saveLocaleConfig', () => {
  it('with no explicit db, opens its own locked transaction', async () => {
    await saveLocaleConfig({ dateFormat: 'YYYY-MM-DD' })
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
    const [strings, ...values] = vi.mocked(prisma.$executeRaw).mock.calls[0] as [TemplateStringsArray, ...unknown[]]
    expect(strings.join('')).toContain('pg_advisory_xact_lock(hashtext(')
    expect(values).toEqual(['locale-config'])
  })

  it('saveLocaleConfigTx composes into an already-open transaction instead of nesting a second one', async () => {
    await prisma.$transaction(async (tx) => {
      await saveLocaleConfigTx(tx as never, { priceFormat: 'symbol_after' })
    })
    // Exactly the one transaction the caller opened - saveLocaleConfigTx must not
    // start a nested one, so it can compose atomically with e.g. an audit log write.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
  })

  it('regression: two concurrent saves of different fields both survive', async () => {
    const [a, b] = await Promise.all([
      saveLocaleConfig({ dateFormat: 'YYYY-MM-DD' }),
      saveLocaleConfig({ priceFormat: 'symbol_after' }),
    ])
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2)
    void a
    void b

    const final = await getLocaleConfig()
    expect(final.dateFormat).toBe('YYYY-MM-DD')
    expect(final.priceFormat).toBe('symbol_after')
  })
})
