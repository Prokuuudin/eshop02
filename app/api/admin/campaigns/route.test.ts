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
