import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/product-overrides-store', () => ({ getDeletedProductsArchive: vi.fn(), purgeDeletedProductArchive: vi.fn() }))
import { requireAdmin } from '@/lib/server-auth'
import { getDeletedProductsArchive, purgeDeletedProductArchive } from '@/lib/product-overrides-store'
import { DELETE, GET } from './route'

const del = (body: unknown) => DELETE(new NextRequest('https://shop.test/api/admin/products/archive', { method: 'DELETE', body: JSON.stringify(body) }))

describe('/api/admin/products/archive', () => {
  beforeEach(() => { vi.clearAllMocks(); vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin' } as never) })
  it('returns the admin gate response without reading the archive', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }) as never)
    expect((await GET()).status).toBe(403)
    expect(getDeletedProductsArchive).not.toHaveBeenCalled()
  })
  it('rejects an empty purge target', async () => {
    expect((await del({ id: '  ' })).status).toBe(400)
    expect(purgeDeletedProductArchive).not.toHaveBeenCalled()
  })
  it('propagates a domain rejection without claiming deletion', async () => {
    vi.mocked(purgeDeletedProductArchive).mockResolvedValue({ success: false, error: 'not_found' })
    expect((await del({ id: 'p1' })).status).toBe(400)
  })
  it('returns the updated archive after a successful purge', async () => {
    vi.mocked(purgeDeletedProductArchive).mockResolvedValue({ success: true, archive: [] })
    const response = await del({ id: ' p1 ' })
    expect(response.status).toBe(200)
    expect(purgeDeletedProductArchive).toHaveBeenCalledWith('p1')
  })
})
