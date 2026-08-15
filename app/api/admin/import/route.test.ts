import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({})) } }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/product-overrides-store', () => ({
  createProduct: vi.fn(),
  getMergedProducts: vi.fn().mockResolvedValue([]),
  upsertProductOverride: vi.fn(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { requireAdminPermission } from '@/lib/server-auth'
import { POST } from './route'

const post = (body: unknown) =>
  POST(new NextRequest('https://shop.test/api/admin/import', { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/admin/import', () => {
  beforeEach(() => vi.clearAllMocks())

  it('gates on catalog.update, matching the /admin/import nav permission', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1', email: 'a@b.com' } as never)
    await post({ rows: [] })
    expect(requireAdminPermission).toHaveBeenCalledWith('catalog.update')
  })

  it('returns the permission-check response as-is when unauthorized', async () => {
    const denied = NextResponse.json({ error: 'forbidden' }, { status: 403 })
    vi.mocked(requireAdminPermission).mockResolvedValue(denied)
    const res = await post({ rows: [{ id: 'p1' }] })
    expect(res.status).toBe(403)
  })

  it('rejects an empty rows array', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1', email: 'a@b.com' } as never)
    const res = await post({ rows: [] })
    expect(res.status).toBe(400)
  })

  it('rejects a batch larger than the row cap without processing any of it', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1', email: 'a@b.com' } as never)
    const rows = Array.from({ length: 5001 }, (_, i) => ({ id: `p${i}`, title: 't', brand: 'b', price: '1', stock: '1', category: 'hair' }))
    const res = await post({ rows })
    const body = await res.json()
    expect(res.status).toBe(413)
    expect(body.error).toBe('too_many_rows')
  })
})
