import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

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
