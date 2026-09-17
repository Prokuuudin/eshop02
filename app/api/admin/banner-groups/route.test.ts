import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({ admin: vi.fn(), get: vi.fn(), save: vi.fn(), tag: vi.fn(), path: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: mocks.admin }))
vi.mock('@/lib/banner-groups-store', () => ({
  getBannerGroups: mocks.get, saveBannerGroups: mocks.save,
  BANNER_ZONES: ['top', 'hero', 'benefits', 'sale', 'bestsellers', 'categories', 'brands', 'productRequest', 'retail', 'bonus', 'faq'],
}))
vi.mock('@/lib/storefront-cache', () => ({ STOREFRONT_CACHE_TAGS: { banners: 'storefront-banners' } }))
vi.mock('next/cache', () => ({ revalidateTag: mocks.tag, revalidatePath: mocks.path }))

import { GET, PUT } from './route'

const group = { id: 'default', name: 'Акции', zone: 'sale', displayType: 'list', scrollMode: 'auto', order: 0 }
function request(groups: unknown) {
  return new NextRequest('http://localhost/api/admin/banner-groups', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ groups }),
  })
}
beforeEach(() => {
  vi.clearAllMocks()
  mocks.admin.mockResolvedValue({ id: 'admin' })
  mocks.get.mockResolvedValue([group])
  mocks.save.mockResolvedValue([group])
})
describe('banner groups', () => {
  it('returns the stored groups', async () => {
    const res = await GET()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ groups: [group] })
  })
  it('saves a valid list of groups and expires the storefront cache', async () => {
    const res = await PUT(request([group, { ...group, id: 'g2', name: 'Топ', zone: 'hero', displayType: 'carousel', order: 1 }]))
    expect(res.status).toBe(200)
    expect(mocks.save).toHaveBeenCalledWith([group, expect.objectContaining({ id: 'g2', zone: 'hero', displayType: 'carousel' })])
    expect(mocks.tag).toHaveBeenCalledWith('storefront-banners', { expire: 0 })
    expect(mocks.path).toHaveBeenCalledWith('/[lang]', 'layout')
  })
  it('rejects an unknown zone, display type or scroll mode', async () => {
    expect((await PUT(request([{ ...group, zone: 'nowhere' }]))).status).toBe(400)
    expect((await PUT(request([{ ...group, displayType: 'grid' }]))).status).toBe(400)
    expect((await PUT(request([{ ...group, scrollMode: 'fast' }]))).status).toBe(400)
    expect(mocks.save).not.toHaveBeenCalled()
  })
  it('requires admin access', async () => {
    mocks.admin.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await GET()).status).toBe(403)
    expect((await PUT(request([group]))).status).toBe(403)
    expect(mocks.save).not.toHaveBeenCalled()
  })
})
