import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  settings: new Map<string, unknown>(), audits: [] as Array<Record<string, unknown>>,
  queue: Promise.resolve() as Promise<unknown>, failAudit: false,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => {
  const client = {
    keyValueSetting: {
      findUnique: vi.fn(async ({ where }: { where: { key: string } }) =>
        state.settings.has(where.key) ? { key: where.key, value: state.settings.get(where.key) } : null),
      upsert: vi.fn(async ({ where, create, update }: { where: { key: string }; create: { value: unknown }; update: { value: unknown } }) => {
        state.settings.set(where.key, structuredClone(state.settings.has(where.key) ? update.value : create.value))
        return { key: where.key, value: state.settings.get(where.key) }
      }),
    },
    brandLine: { findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => (where.id?.in ?? []).map((id) => ({ id }))) },
    product: { findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => where.id.in.map((id) => ({ id, brand: 'Kemon' }))) },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn((run: (tx: unknown) => unknown) => {
      const queued = state.queue.then(async () => {
        const settings = structuredClone(state.settings)
        const audits = structuredClone(state.audits)
        try { return await run(client) } catch (error) {
          state.settings = settings; state.audits = audits; throw error
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
import { createAdminCampaign, deleteAdminCampaign, getAdminCampaigns, updateAdminCampaign } from '@/lib/campaigns-server-store'
import type { PromoCampaign } from '@/lib/promo-campaigns'

const actor = { id: 'admin-1', email: 'admin@example.test' }
const request = new NextRequest('https://shop.test/api/admin/campaigns', { method: 'POST' })
const audit = { actor, request } as never
const input: Omit<PromoCampaign, 'id' | 'createdAt' | 'updatedAt'> = {
  name: 'Campaign', description: 'Secret campaign description', type: 'discount', discountPercent: 10,
  showOldPrice: true, startDate: '2026-11-01', endDate: '2026-11-30', active: true,
  targetCategories: [], targetSubcategories: [], targetBrands: [], targetBrandLineIds: [], minOrderAmount: 0,
}
const saved = (extra: Partial<PromoCampaign> = {}): PromoCampaign => ({
  ...input, id: 'campaign-1', createdAt: '2026-11-01T00:00:00.000Z', updatedAt: '2026-11-01T00:00:00.000Z', ...extra,
})

beforeEach(() => {
  state.settings = new Map(); state.audits = []; state.queue = Promise.resolve(); state.failAudit = false
  vi.clearAllMocks()
})

describe('audited campaign persistence', () => {
  it('creates a campaign with a hashed description in one locked transaction', async () => {
    const result = await createAdminCampaign(input as never, audit)
    expect(result.ok).toBe(true)
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({
      action: 'campaign.created', entityType: 'campaign',
      after: { description: {
        bytes: Buffer.byteLength(input.description),
        sha256: createHash('sha256').update(input.description).digest('hex'),
      } },
    })
    expect(JSON.stringify(state.audits)).not.toContain(input.description)
    expect(prisma.$executeRaw).toHaveBeenCalledOnce()
  })

  it('serializes duplicate updates and records one actual change', async () => {
    state.settings.set('promo-campaigns', [saved()])
    const results = await Promise.all([
      updateAdminCampaign('campaign-1', { active: false }, audit),
      updateAdminCampaign('campaign-1', { active: false }, audit),
    ])
    expect(results.map((result) => result.ok && result.changed)).toEqual([true, false])
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({ action: 'campaign.updated', before: { active: true }, after: { active: false } })
  })

  it('keeps both concurrent creates in the shared KV row', async () => {
    const [first, second] = await Promise.all([
      createAdminCampaign({ ...input, name: 'First' } as never, audit),
      createAdminCampaign({ ...input, name: 'Second' } as never, audit),
    ])
    expect(first.ok && second.ok).toBe(true)
    expect(await getAdminCampaigns()).toHaveLength(2)
    expect(state.audits).toHaveLength(2)
  })

  it('rejects invalid input without mutation or audit', async () => {
    const result = await createAdminCampaign({ ...input, name: '' } as never, audit)
    expect(result).toEqual({ ok: false, status: 400, body: { error: 'name_required' } })
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
    expect(state.audits).toEqual([])
  })

  it('rolls a mutation back when audit append fails', async () => {
    state.settings.set('promo-campaigns', [saved()])
    state.failAudit = true
    await expect(updateAdminCampaign('campaign-1', { name: 'Must roll back' }, audit)).rejects.toThrow('audit failed')
    expect((await getAdminCampaigns())[0].name).toBe('Campaign')
  })

  it('audits one deletion and does not duplicate it on a repeated request', async () => {
    state.settings.set('promo-campaigns', [saved()])
    const deleted = await deleteAdminCampaign('campaign-1', audit)
    const repeated = await deleteAdminCampaign('campaign-1', audit)
    expect(deleted).toMatchObject({ ok: true, changed: true })
    expect(repeated).toEqual({ ok: false, status: 404, body: { error: 'not_found' } })
    expect(state.audits).toHaveLength(1)
    expect(state.audits[0]).toMatchObject({ action: 'campaign.deleted', entityId: 'campaign-1' })
  })
})
