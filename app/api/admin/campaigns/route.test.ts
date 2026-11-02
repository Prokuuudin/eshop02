import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandLine: { findMany: vi.fn() },
    keyValueSetting: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}))

import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'
import { PUT } from './[id]/route'

const ADMIN = { id: 'admin-1', email: 'admin@example.test', platformRole: 'admin' }
const base = {
  name: 'Line campaign', type: 'discount', discountPercent: 10, startDate: '2026-10-30', endDate: '', active: true,
  targetCategories: [], targetSubcategories: [], targetBrands: [], minOrderAmount: 0,
}

function request(url: string, body: unknown): NextRequest {
  return new NextRequest(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue(ADMIN as never)
  vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue(null as never)
  vi.mocked(prisma.keyValueSetting.upsert).mockResolvedValue({} as never)
})

describe('BrandLine campaign admin API', () => {
  it('keeps the existing admin gate', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const response = await POST(request('http://localhost/api/admin/campaigns', base))
    expect(response.status).toBe(403)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('rejects unknown lines on create and stores a valid stable id', async () => {
    vi.mocked(prisma.brandLine.findMany).mockResolvedValue([] as never)
    const invalid = await POST(request('http://localhost/api/admin/campaigns', { ...base, targetBrandLineIds: ['missing'] }))
    expect(invalid.status).toBe(422)

    vi.mocked(prisma.brandLine.findMany).mockResolvedValue([{ id: 'stable-line-id' }] as never)
    const valid = await POST(request('http://localhost/api/admin/campaigns', { ...base, targetBrandLineIds: ['stable-line-id'] }))
    expect(valid.status).toBe(201)
    await expect(valid.json()).resolves.toMatchObject({ targetBrandLineIds: ['stable-line-id'] })
  })

  it('validates line ids on edit', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({
      value: [{ ...base, id: 'campaign-1', description: '', showOldPrice: true, targetBrandLineIds: [], createdAt: '', updatedAt: '' }],
    } as never)
    vi.mocked(prisma.brandLine.findMany).mockResolvedValue([] as never)
    const response = await PUT(
      request('http://localhost/api/admin/campaigns/campaign-1', { targetBrandLineIds: ['missing'] }),
      { params: Promise.resolve({ id: 'campaign-1' }) },
    )
    expect(response.status).toBe(422)
  })
})

describe('scheduled campaigns', () => {
  const stored = (extra: Record<string, unknown>) => ({
    ...base, id: 'campaign-1', description: '', showOldPrice: true, targetBrandLineIds: [], createdAt: '', updatedAt: '', ...extra,
  })
  const saved = () => (vi.mocked(prisma.keyValueSetting.upsert).mock.calls[0][0] as unknown as { update: { value: Array<{ active: boolean }> } }).update.value[0]

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 30, 15, 0))
  })
  afterEach(() => vi.useRealTimers())

  it('arms a campaign created with a future start date even when sent as inactive', async () => {
    const response = await POST(request('http://localhost/api/admin/campaigns', { ...base, startDate: '2026-11-01', active: false }))
    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({ active: true, startDate: '2026-11-01' })
  })

  it('arms a paused campaign when its dates are moved into the future', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({ value: [stored({ active: false, startDate: '2026-09-01', endDate: '2026-09-30' })] } as never)
    const response = await PUT(
      request('http://localhost/api/admin/campaigns/campaign-1', { startDate: '2026-11-01', endDate: '2026-11-30', active: false }),
      { params: Promise.resolve({ id: 'campaign-1' }) },
    )
    expect(response.status).toBe(200)
    expect(saved().active).toBe(true)
  })

  it('still lets an admin pause a campaign that has already started', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({ value: [stored({ active: true, startDate: '2026-10-30' })] } as never)
    const response = await PUT(
      request('http://localhost/api/admin/campaigns/campaign-1', { active: false }),
      { params: Promise.resolve({ id: 'campaign-1' }) },
    )
    expect(response.status).toBe(200)
    expect(saved().active).toBe(false)
  })
})

describe('second_item_discount admin API', () => {
  const secondItem = {
    name: 'Kemon 2nd', type: 'second_item_discount', discountPercent: 50, startDate: '2026-11-01', endDate: '2026-11-30', active: true,
    targetBrands: ['Kemon'], productIds: ['p1', 'p1'], excludedProductIds: ['p2'], excludeSaleItems: true, maxPairs: 2, minOrderAmount: 0,
    targetCategories: ['hair'], targetBrandLineIds: ['line-1'],
  }
  const stored = (extra: Record<string, unknown> = {}) => ({
    ...secondItem, id: 'existing', description: '', productIds: [], excludedProductIds: [], excludeSaleItems: false, maxPairs: null,
    targetCategories: [], targetSubcategories: [], targetBrandLineIds: [], createdAt: '', updatedAt: '', ...extra,
  })
  const saved = () => (vi.mocked(prisma.keyValueSetting.upsert).mock.calls[0][0] as unknown as { update: { value: Array<Record<string, unknown>> } }).update.value
  const put = (id: string, body: unknown) => PUT(request(`http://localhost/api/admin/campaigns/${id}`, body), { params: Promise.resolve({ id }) })

  it('keeps the admin gate', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await POST(request('http://localhost/api/admin/campaigns', secondItem))).status).toBe(403)
    expect((await put('existing', secondItem)).status).toBe(403)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('stores a normalized campaign with only brand/product targeting', async () => {
    const response = await POST(request('http://localhost/api/admin/campaigns', secondItem))
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body).toMatchObject({
      type: 'second_item_discount', discountPercent: 50, targetBrands: ['Kemon'], productIds: ['p1'], excludedProductIds: ['p2'],
      excludeSaleItems: true, maxPairs: 2, targetCategories: [], targetSubcategories: [], targetBrandLineIds: [],
    })
    expect(prisma.brandLine.findMany).not.toHaveBeenCalled()
  })

  it.each([
    [{ targetBrands: [] }, 'brand_required'],
    [{ targetBrands: ['A', 'B'] }, 'brand_required'],
    [{ discountPercent: 0 }, 'invalid_discount_percent'],
    [{ discountPercent: 150 }, 'invalid_discount_percent'],
    [{ maxPairs: -2 }, 'invalid_max_pairs'],
  ])('rejects invalid settings %j', async (patch, error) => {
    const response = await POST(request('http://localhost/api/admin/campaigns', { ...secondItem, ...patch }))
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error })
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('rejects an overlapping second-item campaign for the same brand, also when inactive', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({ value: [stored({ active: false, startDate: '2026-11-20', endDate: '' })] } as never)
    const response = await POST(request('http://localhost/api/admin/campaigns', { ...secondItem, targetBrands: [' kemon '] }))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toMatchObject({ error: 'overlapping_second_item_campaign', id: 'existing' })
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('allows another brand or non-overlapping dates', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({ value: [stored({ startDate: '2026-10-01', endDate: '2026-10-31' })] } as never)
    expect((await POST(request('http://localhost/api/admin/campaigns', secondItem))).status).toBe(201)
    expect((await POST(request('http://localhost/api/admin/campaigns', { ...secondItem, targetBrands: ['Other'], startDate: '2026-10-15' }))).status).toBe(201)
  })

  it('validates edits, ignores the campaign itself and blocks an overlap introduced by an edit', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({ value: [
      stored(),
      stored({ id: 'december', startDate: '2026-12-01', endDate: '2026-12-31' }),
    ] } as never)
    expect((await put('existing', { discountPercent: 30 })).status).toBe(200)
    expect(saved()[0]).toMatchObject({ discountPercent: 30, type: 'second_item_discount' })
    vi.mocked(prisma.keyValueSetting.upsert).mockClear()
    const overlap = await put('december', { startDate: '2026-11-15' })
    expect(overlap.status).toBe(409)
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
    expect((await put('existing', { discountPercent: 101 })).status).toBe(400)
  })

  it('pausing a second-item campaign still works', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({ value: [stored({ startDate: '2020-01-01' })] } as never)
    expect((await put('existing', { active: false })).status).toBe(200)
    expect(saved()[0]).toMatchObject({ active: false, targetBrands: ['Kemon'] })
  })

  it('drops second-item fields when a campaign changes to a percentage discount', async () => {
    vi.mocked(prisma.keyValueSetting.findUnique).mockResolvedValue({ value: [stored({ productIds: ['p1'], maxPairs: 3 })] } as never)
    expect((await put('existing', { type: 'discount', discountPercent: 10 })).status).toBe(200)
    const [campaign] = JSON.parse(JSON.stringify(saved())) as Array<Record<string, unknown>>
    expect(campaign).toMatchObject({ type: 'discount', discountPercent: 10 })
    expect(campaign).not.toHaveProperty('productIds')
    expect(campaign).not.toHaveProperty('maxPairs')
  })
})
