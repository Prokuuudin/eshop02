import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  rows: new Map<string, unknown>(), queue: Promise.resolve() as Promise<unknown>,
  audits: [] as Array<Record<string, unknown>>, failAudit: false,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const client = {
    keyValueSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        state.rows.has(where.key) ? { key: where.key, value: state.rows.get(where.key) } : null),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        state.rows.set(where.key, state.rows.has(where.key) ? update.value : create.value)
        return { key: where.key, value: state.rows.get(where.key) }
      }),
    },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn((run: (tx: unknown) => unknown) => {
      const queued = state.queue.then(async () => {
        const rows = structuredClone(state.rows)
        const audits = structuredClone(state.audits)
        try { return await run(client) } catch (error) {
          state.rows = rows; state.audits = audits; throw error
        }
      })
      state.queue = queued.then(() => undefined, () => undefined)
      return queued
    }),
  }
  return { prisma: client }
})
vi.mock('@/lib/server-audit', () => ({
  appendServerAudit: vi.fn(async (_tx: unknown, _request: unknown, _actor: unknown, input: Record<string, unknown>) => {
    if (state.failAudit) throw new Error('audit failed')
    state.audits.push(input)
  }),
}))

import { prisma } from '@/lib/prisma'
import { getBannerGroups, saveBannerGroups, type BannerGroup } from '@/lib/banner-groups-store'

const actor = { id: 'admin-1', email: 'admin@example.test' }
const request = new NextRequest('https://shop.test/api/admin/banner-groups', { method: 'PUT' })
const audit = { actor, request } as never
const base: BannerGroup = { id: 'default', name: 'Sale', zone: 'sale', displayType: 'list', scrollMode: 'auto', order: 0 }

beforeEach(() => {
  state.rows = new Map([['banner-groups', { groups: [base] }]])
  state.queue = Promise.resolve(); state.audits = []; state.failAudit = false
  vi.clearAllMocks()
})

describe('saveBannerGroups', () => {
  it('writes changed group fields and the audit event in one locked transaction', async () => {
    const result = await saveBannerGroups([{ ...base, displayType: 'carousel', scrollMode: 'manual' }], audit)
    expect(result.changed).toBe(true)
    expect(prisma.$transaction).toHaveBeenCalledOnce()
    expect(prisma.$executeRaw).toHaveBeenCalledOnce()
    expect(state.audits).toEqual([expect.objectContaining({
      action: 'banner_groups.updated', entityId: 'banner-groups',
      before: { groups: [{ id: 'default', displayType: 'list', scrollMode: 'auto' }] },
      after: { groups: [{ id: 'default', displayType: 'carousel', scrollMode: 'manual' }] },
    })])
  })

  it('does not write or audit an identical state, including concurrent repeats', async () => {
    const changed = [{ ...base, name: 'New name' }]
    const results = await Promise.all([saveBannerGroups(changed, audit), saveBannerGroups(changed, audit)])
    expect(results.map((result) => result.changed)).toEqual([true, false])
    expect(prisma.keyValueSetting.upsert).toHaveBeenCalledOnce()
    expect(state.audits).toHaveLength(1)
  })

  it('rolls the KV mutation back when audit append fails', async () => {
    state.failAudit = true
    await expect(saveBannerGroups([{ ...base, name: 'Must roll back' }], audit)).rejects.toThrow('audit failed')
    expect((await getBannerGroups())[0].name).toBe('Sale')
    expect(state.audits).toEqual([])
  })
})
