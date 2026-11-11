import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({ admin: vi.fn(), reorder: vi.fn(), tag: vi.fn(), path: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/banners-server-store', () => ({ reorderAdminBanner: mocks.reorder }))
vi.mock('@/lib/storefront-cache', () => ({ STOREFRONT_CACHE_TAGS: { banners: 'storefront-banners' } }))
vi.mock('next/cache', () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }))

import { POST } from './route'

function request(id: string, direction: string) {
  return new NextRequest('http://localhost/api/admin/banners/reorder', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, direction }),
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ id: 'admin' })
  mocks.reorder.mockResolvedValue('moved')
})
describe('moving banners', () => {
  it('passes the move and authenticated actor to the transactional store', async () => {
    expect((await POST(request('b', 'up'))).status).toBe(200)
    expect(mocks.reorder).toHaveBeenCalledWith(
      'b', 'up', expect.objectContaining({ actor: { id: 'admin' }, request: expect.any(NextRequest) }),
    )
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
    expect(mocks.path).toHaveBeenCalledWith('/[lang]', 'layout')
  })
  it('does not move past the first or last position', async () => {
    mocks.reorder.mockResolvedValue('unchanged')
    expect(await (await POST(request('a', 'up'))).json()).toEqual({ ok: true, moved: false })
    expect(await (await POST(request('c', 'down'))).json()).toEqual({ ok: true, moved: false })
    expect(mocks.tag).not.toHaveBeenCalled()
  })
  it('does not publish a partially saved order if a write fails', async () => {
    mocks.reorder.mockRejectedValueOnce(new Error('write failed'))
    expect((await POST(request('b', 'up'))).status).toBe(500)
    expect(mocks.tag).not.toHaveBeenCalled()
  })
  it('rejects unknown banners and invalid directions', async () => {
    mocks.reorder.mockResolvedValue('not_found')
    expect((await POST(request('missing', 'up'))).status).toBe(404)
    expect((await POST(request('a', 'sideways'))).status).toBe(400)
    expect(mocks.reorder).toHaveBeenCalledTimes(1)
  })
  it('requires admin access', async () => {
    mocks.admin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await POST(request('b', 'up'))).status).toBe(403)
    expect(mocks.reorder).not.toHaveBeenCalled()
  })
})
