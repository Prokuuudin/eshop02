import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Stateful harness: staged KV and audit rows, published only on success;
// transactions run one at a time, as the per-user advisory lock guarantees.

type Audit = { actorId: string; action: string; entityType: string; entityId: string; before?: unknown; after?: unknown }
type State = { kv: Record<string, unknown>; audits: Audit[]; writes: number }

const h = vi.hoisted(() => ({
  state: null as unknown as State,
  queue: Promise.resolve() as Promise<unknown>,
  appendServerAudit: vi.fn(),
  locks: [] as string[],
}))

function db(s: State) {
  return {
    _state: s,
    $executeRaw: async (_strings: TemplateStringsArray, key: string) => { h.locks.push(key); return 0 },
    keyValueSetting: {
      findUnique: async ({ where }: { where: { key: string } }) => (where.key in s.kv ? { key: where.key, value: structuredClone(s.kv[where.key]) } : null),
      upsert: async ({ where, update }: { where: { key: string }; update: { value: unknown } }) => {
        s.kv[where.key] = structuredClone(update.value)
        s.writes += 1
      },
    },
  }
}

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: h.appendServerAudit }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: { findUnique: async ({ where }: { where: { key: string } }) => (where.key in h.state.kv ? { value: h.state.kv[where.key] } : null) },
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

import { getAdminDashboardPrefs, saveAdminDashboardPrefs } from './admin-dashboard-prefs-server-store'

const request = new NextRequest('http://localhost/api/admin/dashboard-prefs', { method: 'PUT' })
const audit = { actor: { id: 'admin-1', email: 'admin@test.com' }, request } as never
const KEY = 'admin-dashboard-prefs:admin-1'

beforeEach(() => {
  vi.clearAllMocks()
  h.queue = Promise.resolve()
  h.locks = []
  h.state = { kv: { [KEY]: { cardOrder: ['orders', 'products'], favoriteCardIds: ['orders'] } }, audits: [], writes: 0 }
  h.appendServerAudit.mockImplementation(async (tx: { _state: State }, _req: NextRequest, actor: { id: string }, input: Omit<Audit, 'actorId'>) => {
    tx._state.audits.push({ actorId: actor.id, ...input })
  })
})

describe('saveAdminDashboardPrefs', () => {
  it('updates only the card order, keeps favourites and audits the changed field under the user lock', async () => {
    await expect(saveAdminDashboardPrefs('admin-1', { cardOrder: ['products', 'orders'] }, audit))
      .resolves.toEqual({ cardOrder: ['products', 'orders'], favoriteCardIds: ['orders'] })

    expect(h.locks).toEqual([KEY])
    expect(h.state.kv[KEY]).toEqual({ cardOrder: ['products', 'orders'], favoriteCardIds: ['orders'] })
    expect(h.state.audits).toEqual([{
      actorId: 'admin-1', action: 'admin.dashboard_prefs_updated', entityType: 'admin_dashboard_prefs', entityId: 'admin-1',
      before: { cardOrder: ['orders', 'products'] },
      after: { cardOrder: ['products', 'orders'] },
    }])
  })

  it('updates favourites alone and records only that field', async () => {
    await saveAdminDashboardPrefs('admin-1', { favoriteCardIds: ['orders', 'clients'] }, audit)
    expect(h.state.kv[KEY]).toEqual({ cardOrder: ['orders', 'products'], favoriteCardIds: ['orders', 'clients'] })
    expect(h.state.audits[0]).toMatchObject({ before: { favoriteCardIds: ['orders'] }, after: { favoriteCardIds: ['orders', 'clients'] } })
  })

  it('resets the card order with null', async () => {
    await saveAdminDashboardPrefs('admin-1', { cardOrder: null }, audit)
    expect(h.state.audits[0]).toMatchObject({ before: { cardOrder: ['orders', 'products'] }, after: { cardOrder: null } })
  })

  it('treats a request that normalises to the stored value as a no-op: no write, no event', async () => {
    const result = await saveAdminDashboardPrefs('admin-1', { favoriteCardIds: ['orders', 7 as unknown as string] }, audit)
    expect(result).toEqual({ cardOrder: ['orders', 'products'], favoriteCardIds: ['orders'] })
    expect(h.state.writes).toBe(0)
    expect(h.state.audits).toHaveLength(0)
  })

  it('creates no row and no event for defaults when nothing was stored yet', async () => {
    h.state.kv = {}
    await expect(saveAdminDashboardPrefs('admin-1', { cardOrder: null, favoriteCardIds: [] }, audit))
      .resolves.toEqual({ cardOrder: null, favoriteCardIds: [] })
    expect(h.state.kv).toEqual({})
    expect(h.state.audits).toHaveLength(0)
  })

  it('keeps preferences per session user', async () => {
    await saveAdminDashboardPrefs('admin-2', { favoriteCardIds: ['rfq'] }, audit)
    expect(h.state.kv['admin-dashboard-prefs:admin-2']).toEqual({ cardOrder: null, favoriteCardIds: ['rfq'] })
    expect(h.state.kv[KEY]).toEqual({ cardOrder: ['orders', 'products'], favoriteCardIds: ['orders'] })
    expect(await getAdminDashboardPrefs('admin-2')).toEqual({ cardOrder: null, favoriteCardIds: ['rfq'] })
  })

  it('parallel order and favourites updates do not overwrite each other', async () => {
    await Promise.all([
      saveAdminDashboardPrefs('admin-1', { cardOrder: ['products', 'orders'] }, audit),
      saveAdminDashboardPrefs('admin-1', { favoriteCardIds: ['products'] }, audit),
    ])
    expect(h.state.kv[KEY]).toEqual({ cardOrder: ['products', 'orders'], favoriteCardIds: ['products'] })
    expect(h.state.audits.map((a) => Object.keys(a.after as object))).toEqual([['cardOrder'], ['favoriteCardIds']])
  })

  it('parallel identical updates write and audit once', async () => {
    await Promise.all([
      saveAdminDashboardPrefs('admin-1', { cardOrder: ['products', 'orders'] }, audit),
      saveAdminDashboardPrefs('admin-1', { cardOrder: ['products', 'orders'] }, audit),
    ])
    expect(h.state.writes).toBe(1)
    expect(h.state.audits).toHaveLength(1)
  })

  it('rolls the preferences back when the audit fails', async () => {
    h.appendServerAudit.mockRejectedValueOnce(new Error('audit unavailable'))
    const before = structuredClone(h.state)
    await expect(saveAdminDashboardPrefs('admin-1', { cardOrder: ['products'] }, audit)).rejects.toThrow('audit unavailable')
    expect(h.state).toEqual(before)
  })
})
