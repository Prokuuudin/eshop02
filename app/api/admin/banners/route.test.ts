import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  read: vi.fn(), write: vi.fn(), tag: vi.fn(), path: vi.fn(), delete: vi.fn(), removeAssignment: vi.fn(),
  defaultGroup: { id: 'default', name: 'Акции', zone: 'sale', displayType: 'list', order: 0 },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn().mockResolvedValue({ id: 'admin' }) }))
vi.mock('@/lib/banners-server-store', () => ({ readBannersData: mocks.read, writeBannersData: mocks.write }))
vi.mock('@/lib/banner-groups-store', () => ({
  getBannerGroups: vi.fn().mockResolvedValue([mocks.defaultGroup]),
  DEFAULT_GROUP_ID: 'default',
}))
vi.mock('@/lib/banner-group-assignment-store', () => ({ removeBannerGroupAssignment: mocks.removeAssignment }))
vi.mock('@/lib/storefront-cache', () => ({ STOREFRONT_CACHE_TAGS: { banners: 'storefront-banners' } }))
vi.mock('@/lib/prisma', () => ({ prisma: { banner: { delete: mocks.delete } } }))
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
  mocks.read.mockResolvedValue({ banners: [{ ...existing }] })
  mocks.write.mockResolvedValue(undefined)
})
describe('banner publication', () => {
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
    expect(mocks.write).toHaveBeenCalledWith({ banners: [banner] })
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
    expect(mocks.path).toHaveBeenCalledWith('/[lang]', 'layout')
  })
  it('updates only the selected banner so parallel reordering cannot overwrite other banners', async () => {
    mocks.read.mockResolvedValue({ banners: [{ ...existing }, { ...existing, id: 'second', order: 2 }] })
    const res = await PUT(request({ order: 2, active: false }, 'PUT'), { params: Promise.resolve({ id: 'old' }) })
    expect(res.status).toBe(200)
    expect(mocks.write).toHaveBeenCalledWith({ banners: [expect.objectContaining({ id: 'old', order: 2, active: false })] })
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
  })
  it('removes the published row and expires cached pages on all locales', async () => {
    const res = await DELETE(new NextRequest('http://localhost/api/admin/banners/old', { method: 'DELETE' }), { params: Promise.resolve({ id: 'old' }) })
    expect(res.status).toBe(200)
    expect(mocks.delete).toHaveBeenCalledWith({ where: { id: 'old' } })
    expect(mocks.removeAssignment).toHaveBeenCalledWith('old')
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
    expect(mocks.path).toHaveBeenCalledWith('/[lang]', 'layout')
  })
})
