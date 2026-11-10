import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  admin: vi.fn(), read: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), tag: vi.fn(), path: vi.fn(),
  defaultGroup: { id: 'default', name: 'Акции', zone: 'sale', displayType: 'list', scrollMode: 'auto', order: 0 },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/banners-server-store', () => ({
  readBannersData: mocks.read, createAdminBanner: mocks.create,
  updateAdminBanner: mocks.update, deleteAdminBanner: mocks.remove,
}))
vi.mock('@/lib/banner-groups-store', () => ({
  getBannerGroups: vi.fn().mockResolvedValue([mocks.defaultGroup]),
  DEFAULT_GROUP_ID: 'default',
}))
vi.mock('@/lib/storefront-cache', () => ({ STOREFRONT_CACHE_TAGS: { banners: 'storefront-banners' } }))
vi.mock('next/cache', () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }))

import { POST } from './route'
import { PUT, DELETE } from './[id]/route'

const existing = { id: 'old', type: 'sale', title: 'Sale', order: 1, active: true, groupId: 'default' }
function request(item: unknown, method = 'POST') {
  return new NextRequest('http://localhost/api/admin/banners', {
    method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ item }),
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ id: 'admin' })
  mocks.read.mockResolvedValue({ banners: [{ ...existing }] })
  mocks.create.mockImplementation(async (item) => ({
    ...existing, ...item, id: 'banner-new', title: item.title ?? '', subtitle: item.subtitle ?? '',
    image: item.image ?? '', link: '', ctaLabel: '', ctaStyle: 'primary', bgColor: '#ffffff',
    textColor: 'dark', groupId: 'default', placement: 'list', zone: 'sale', scrollMode: 'auto',
    order: 2, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }))
  mocks.update.mockResolvedValue({ status: 'updated', banner: { ...existing, active: false, order: 2 } })
  mocks.remove.mockResolvedValue({ status: 'deleted', banner: existing })
})
describe('banner publication', () => {
  it('rejects create, update and delete before storage without admin access', async () => {
    mocks.admin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await POST(request({ type: 'image' }))).status).toBe(403)
    expect((await PUT(request({ active: false }, 'PUT'), { params: Promise.resolve({ id: 'old' }) })).status).toBe(403)
    expect((await DELETE(new NextRequest('http://localhost/api/admin/banners/old', { method: 'DELETE' }), { params: Promise.resolve({ id: 'old' }) })).status).toBe(403)
    expect(mocks.create).not.toHaveBeenCalled()
    expect(mocks.update).not.toHaveBeenCalled()
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('keeps the failed_to_create contract for invalid JSON', async () => {
    const invalid = new NextRequest('http://localhost/api/admin/banners', { method: 'POST', body: '{' })
    const response = await POST(invalid)
    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'failed_to_create' })
    expect(mocks.create).not.toHaveBeenCalled()
  })
  it('preserves the video format when publishing without a title', async () => {
    const res = await POST(request({ type: 'video', image: '/api/media/banner.mp4' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ type: 'video', image: '/api/media/banner.mp4', title: '', active: true, groupId: 'default' })
  })
  it('saves a ready-made image without a title and immediately expires the storefront cache', async () => {
    const res = await POST(request({ type: 'image', image: '/api/media/banner.png' }))
    expect(res.status).toBe(200)
    const banner = await res.json()
    expect(banner).toMatchObject({ type: 'image', title: '', active: true, order: 2 })
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image', image: '/api/media/banner.png' }),
      expect.objectContaining({ actor: { id: 'admin' }, request: expect.any(NextRequest) }),
    )
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
    expect(mocks.path).toHaveBeenCalledWith('/[lang]', 'layout')
  })
  it('updates only the selected banner so parallel reordering cannot overwrite other banners', async () => {
    mocks.read.mockResolvedValue({ banners: [{ ...existing }, { ...existing, id: 'second', order: 2 }] })
    const res = await PUT(request({ order: 2, active: false }, 'PUT'), { params: Promise.resolve({ id: 'old' }) })
    expect(res.status).toBe(200)
    expect(mocks.update).toHaveBeenCalledWith(
      'old', { order: 2, active: false },
      expect.objectContaining({ actor: { id: 'admin' }, request: expect.any(NextRequest) }),
    )
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
  })
  it('removes the published row and expires cached pages on all locales', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/admin/banners/old', { method: 'DELETE' }), { params: Promise.resolve({ id: 'old' }) })
    expect(res.status).toBe(200)
    expect(mocks.remove).toHaveBeenCalledWith(
      'old', expect.objectContaining({ actor: { id: 'admin' }, request: expect.any(NextRequest) }),
    )
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
    expect(mocks.path).toHaveBeenCalledWith('/[lang]', 'layout')
  })
})
