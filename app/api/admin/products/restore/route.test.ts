import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/product-overrides-store', () => ({ restoreDeletedProduct: vi.fn(), getDeletedProductsArchive: vi.fn() }))
import { requireAdmin } from '@/lib/server-auth'
import { getDeletedProductsArchive, restoreDeletedProduct } from '@/lib/product-overrides-store'
import { POST } from './route'

const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/admin/products/restore', { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/admin/products/restore', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin' } as never) })
  it('stops at the admin gate', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never)
    expect((await post({ id: 'p1' })).status).toBe(403)
    expect(restoreDeletedProduct).not.toHaveBeenCalled()
  })
  it('rejects a missing product id', async () => {
    expect((await post({})).status).toBe(400)
    expect(restoreDeletedProduct).not.toHaveBeenCalled()
  })
  it('does not reload the archive when restoration fails', async () => {
    vi.mocked(restoreDeletedProduct).mockResolvedValue({ success: false, error: 'not_found' })
    expect((await post({ id: 'p1' })).status).toBe(400)
    expect(getDeletedProductsArchive).not.toHaveBeenCalled()
  })
  it('returns products and the post-restore archive', async () => {
    vi.mocked(restoreDeletedProduct).mockResolvedValue({ success: true, products: [{ id: 'p1' }] as never })
    vi.mocked(getDeletedProductsArchive).mockResolvedValue([])
    const response = await post({ id: ' p1 ' })
    expect(response.status).toBe(200)
    expect(restoreDeletedProduct).toHaveBeenCalledWith('p1')
  })
})
