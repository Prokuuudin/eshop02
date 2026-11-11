import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

type Row = Record<string, unknown> & { id: string; order: number }
const state = vi.hoisted(() => ({
  banners: [] as Row[], settings: new Map<string, unknown>(), audits: [] as Array<Record<string, unknown>>,
  queue: Promise.resolve() as Promise<unknown>, failAudit: false, failUpdateAt: 0, updateCount: 0,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const client = {
    banner: {
      findMany: vi.fn(async (args?: { select?: Record<string, boolean> }) => {
        const rows = [...state.banners].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
        return args?.select ? rows.map(({ id, order }) => ({ id, order })) : structuredClone(rows)
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
        structuredClone(state.banners.find((row) => row.id === where.id) ?? null)),
      create: vi.fn(async ({ data }: { data: Row }) => {
        const now = new Date('2026-11-09T12:00:00.000Z')
        const row = { ...data, createdAt: now, updatedAt: now }
        state.banners.push(row)
        return structuredClone(row)
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        state.updateCount += 1
        if (state.failUpdateAt === state.updateCount) throw new Error('banner update failed')
        const index = state.banners.findIndex((row) => row.id === where.id)
        if (index < 0) throw new Error('missing')
        state.banners[index] = { ...state.banners[index], ...data, updatedAt: new Date('2026-11-09T12:01:00.000Z') }
        return structuredClone(state.banners[index])
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = state.banners.findIndex((row) => row.id === where.id)
        if (index < 0) throw new Error('missing')
        return state.banners.splice(index, 1)[0]
      }),
      upsert: vi.fn(),
    },
    keyValueSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        state.settings.has(where.key) ? { key: where.key, value: state.settings.get(where.key) } : null),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        state.settings.set(where.key, state.settings.has(where.key) ? update.value : create.value)
        return { key: where.key, value: state.settings.get(where.key) }
      }),
    },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn((run: (tx: unknown) => unknown) => {
      const queued = state.queue.then(async () => {
        const banners = structuredClone(state.banners)
        const settings = structuredClone(state.settings)
        const audits = structuredClone(state.audits)
        try { return await run(client) } catch (error) {
          state.banners = banners; state.settings = settings; state.audits = audits; throw error
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
import { createAdminBanner, deleteAdminBanner, reorderAdminBanner, updateAdminBanner } from '@/lib/banners-server-store'

const actor = { id: 'admin-1', email: 'admin@example.test' }
const request = new NextRequest('https://shop.test/api/admin/banners', { method: 'POST' })
const audit = { actor, request } as never
const row = (id: string, order: number): Row => ({
  id, type: 'image', title: id, subtitle: '', image: `/media/${id}.png`, link: '', ctaLabel: '',
  ctaStyle: 'primary', bgColor: '#fff', textColor: 'dark', active: true, order,
  createdAt: new Date('2026-11-01T00:00:00.000Z'), updatedAt: new Date('2026-11-01T00:00:00.000Z'),
})

beforeEach(() => {
  state.banners = [row('a', 1), row('b', 2), row('c', 3)]
  state.settings = new Map([['banner-groups', { groups: [{ id: 'default', name: 'Sale', zone: 'sale', displayType: 'list', scrollMode: 'auto', order: 0 }] }]])
  state.audits = []; state.queue = Promise.resolve(); state.failAudit = false
  state.failUpdateAt = 0; state.updateCount = 0
  vi.clearAllMocks()
})

describe('audited banner mutations', () => {
  it('creates a banner and audits media only by size and hash', async () => {
    const banner = await createAdminBanner({ type: 'image', title: 'Hero', image: '/secret/hero.png' }, audit)
    expect(banner.order).toBe(4)
    expect(state.audits).toEqual([expect.objectContaining({
      action: 'banner.created', entityId: banner.id,
      after: expect.objectContaining({ image: {
        bytes: Buffer.byteLength('/secret/hero.png'),
        sha256: createHash('sha256').update('/secret/hero.png').digest('hex'),
      } }),
    })])
    expect(JSON.stringify(state.audits)).not.toContain('/secret/hero.png')
  })

  it('serializes duplicate updates and records only the real change', async () => {
    const results = await Promise.all([
      updateAdminBanner('b', { active: false }, audit),
      updateAdminBanner('b', { active: false }, audit),
    ])
    expect(results.map((result) => result.status)).toEqual(['updated', 'unchanged'])
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({ action: 'banner.updated', before: { active: true }, after: { active: false } })
  })

  it('rolls deletion back when audit append fails', async () => {
    state.failAudit = true
    await expect(deleteAdminBanner('b', audit)).rejects.toThrow('audit failed')
    expect(state.banners.map((banner) => banner.id)).toEqual(['a', 'b', 'c'])
  })

  it('records complete order before and after a move', async () => {
    await expect(reorderAdminBanner('b', 'up', audit)).resolves.toBe('moved')
    expect([...state.banners].sort((a, b) => a.order - b.order).map((banner) => banner.id)).toEqual(['b', 'a', 'c'])
    expect(state.audits).toEqual([expect.objectContaining({
      action: 'banner.reordered', entityId: 'b',
      before: { order: ['a', 'b', 'c'] }, after: { order: ['b', 'a', 'c'] },
    })])
  })

  it('rolls every position back after a partial reorder failure or audit failure', async () => {
    state.failUpdateAt = 2
    await expect(reorderAdminBanner('b', 'up', audit)).rejects.toThrow('banner update failed')
    expect(state.banners.map((banner) => banner.order)).toEqual([1, 2, 3])
    state.failUpdateAt = 0; state.updateCount = 0; state.failAudit = true
    await expect(reorderAdminBanner('b', 'up', audit)).rejects.toThrow('audit failed')
    expect(state.banners.map((banner) => banner.order)).toEqual([1, 2, 3])
    expect(state.audits).toEqual([])
    expect(prisma.$transaction).toHaveBeenCalledTimes(2)
  })

  it('does not write or audit a boundary move', async () => {
    await expect(reorderAdminBanner('a', 'up', audit)).resolves.toBe('unchanged')
    expect(prisma.banner.update).not.toHaveBeenCalled()
    expect(state.audits).toEqual([])
  })
})
