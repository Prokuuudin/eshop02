import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'
import { hasAdminPermission, type AdminPermission } from '@/lib/admin-permissions'

type Subject = { id: string; email: string; platformRole: string; teamRole?: string } | null
const state = vi.hoisted(() => ({ user: null as Subject, requested: [] as string[] }))

// The real permission model decides; only the session lookup is replaced.
vi.mock('@/lib/server-auth', () => ({
  requireAdminPermission: async (permission: AdminPermission) => {
    state.requested.push(permission)
    if (!state.user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    if (!hasAdminPermission(state.user, permission)) return NextResponse.json({ error: 'forbidden', permission }, { status: 403 })
    return state.user
  },
}))
vi.mock('@/lib/brand-lines/brand-line-admin', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/brand-lines/brand-line-admin')>()
  return {
    ...actual,
    listBrandLines: vi.fn(async () => ({ brands: [], lines: [], openReviews: 0 })),
    createBrandLine: vi.fn(async () => ({ id: 'l1', key: 'acme/x' })),
    getBrandLineDetail: vi.fn(async () => ({ line: { id: 'l1' }, sources: [], products: [] })),
    updateBrandLine: vi.fn(async () => ({ id: 'l1' })),
    setProductMembership: vi.fn(async () => ({ productId: 'p1', status: 'active' })),
    listReviewItems: vi.fn(async () => []),
    actOnReviewItem: vi.fn(async () => ({ id: 'r1', status: 'resolved' })),
  }
})
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
const { revalidateTag } = vi.hoisted(() => ({ revalidateTag: vi.fn() }))
vi.mock('next/cache', () => ({ revalidateTag }))
vi.mock('server-only', () => ({}))

import * as linesRoute from './route'
import * as lineRoute from './[id]/route'
import * as productsRoute from './[id]/products/route'
import * as reviewListRoute from './review/route'
import * as reviewRoute from './review/[id]/route'
import { BrandLineAdminError, brandLineErrorResponse } from '@/lib/brand-lines/brand-line-admin'

const params = { params: Promise.resolve({ id: 'l1' }) }
const req = (method: string, body?: unknown, url = 'http://localhost/api/admin/brand-lines') =>
  new NextRequest(url, { method, headers: { 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) })

const calls: Array<{ name: string; permission: AdminPermission; run: () => Promise<Response> }> = [
  { name: 'GET list', permission: 'catalog.read', run: () => linesRoute.GET() },
  { name: 'POST create', permission: 'catalog.update', run: () => linesRoute.POST(req('POST', { slug: 'x', names: { lv: 'X' }, brandKey: 'acme' })) },
  { name: 'GET detail', permission: 'catalog.read', run: () => lineRoute.GET(req('GET'), params) },
  { name: 'PATCH update', permission: 'catalog.update', run: () => lineRoute.PATCH(req('PATCH', { slug: 'y' }), params) },
  { name: 'POST membership', permission: 'catalog.update', run: () => productsRoute.POST(req('POST', { product: 'p1', action: 'include' }), params) },
  { name: 'GET review', permission: 'catalog.read', run: () => reviewListRoute.GET(req('GET', undefined, 'http://localhost/api/admin/brand-lines/review?status=open')) },
  { name: 'POST review', permission: 'catalog.update', run: () => reviewRoute.POST(req('POST', { action: 'resolve' }), { params: Promise.resolve({ id: 'r1' }) }) },
]

beforeEach(() => { state.requested = []; revalidateTag.mockClear() })

describe('BrandLine admin API authorization', () => {
  it.each(calls)('$name requires $permission', async ({ run, permission }) => {
    state.user = { id: 'a1', email: 'admin@example.test', platformRole: 'admin' }
    expect((await run()).status).toBeLessThan(300)
    expect(state.requested).toEqual([permission])
  })

  it.each(calls)('$name rejects anonymous, customers, company owners and staff managers', async ({ run }) => {
    state.user = null
    expect((await run()).status).toBe(401)
    for (const user of [
      { id: 'c1', email: 'customer@example.test', platformRole: 'user' },
      { id: 'c2', email: 'owner@example.test', platformRole: 'user', teamRole: 'admin' },
      { id: 'm1', email: 'manager@example.test', platformRole: 'user', teamRole: 'manager' },
    ]) {
      state.user = user
      expect((await run()).status).toBe(403)
    }
  })

  it('validates the review status filter', async () => {
    state.user = { id: 'a1', email: 'admin@example.test', platformRole: 'admin' }
    expect((await reviewListRoute.GET(req('GET', undefined, 'http://localhost/api/admin/brand-lines/review?status=bogus'))).status).toBe(400)
  })
})

describe('BrandLine admin error mapping', () => {
  it('maps domain, validation and database-trigger errors to stable responses', () => {
    expect(brandLineErrorResponse(new BrandLineAdminError('line_cycle', 422))).toEqual({ status: 422, body: { error: 'line_cycle' } })
    expect(brandLineErrorResponse(new Error('ERROR: brand_line_parent_brand_mismatch'))).toEqual({ status: 409, body: { error: 'brand_line_parent_brand_mismatch' } })
    expect(brandLineErrorResponse(Object.assign(new Error('unique'), { code: 'P2002' }))).toEqual({ status: 409, body: { error: 'conflict' } })
    expect(brandLineErrorResponse(new Error('boom'))).toBeNull()
  })
})

describe('BrandLine admin page permission', () => {
  it('maps the admin page to catalog.read in every language', async () => {
    const { permissionForAdminPath } = await import('@/lib/admin-permissions')
    for (const path of ['/admin/brand-lines', '/ru/admin/brand-lines', '/lv/admin/brand-lines', '/en/admin/brand-lines']) expect(permissionForAdminPath(path)).toBe('catalog.read')
  })
})

describe('BrandLine storefront revalidation', () => {
  const admin = { id: 'a1', email: 'admin@example.test', platformRole: 'admin' }

  it('revalidates sale and bestseller caches only after a committed membership or line change', async () => {
    state.user = admin
    expect((await lineRoute.PATCH(req('PATCH', { slug: 'y' }), params)).status).toBe(200)
    expect((await productsRoute.POST(req('POST', { product: 'p1', action: 'exclude' }), params)).status).toBe(200)
    expect(revalidateTag.mock.calls.map(call => call[0]).sort()).toEqual(['storefront-bestsellers', 'storefront-bestsellers', 'storefront-sale-products', 'storefront-sale-products'])
  })

  it('does not revalidate when the change fails, is forbidden or only reads', async () => {
    const admin_ = await import('@/lib/brand-lines/brand-line-admin')
    state.user = admin
    vi.mocked(admin_.setProductMembership).mockRejectedValueOnce(new BrandLineAdminError('product_brand_mismatch', 422))
    expect((await productsRoute.POST(req('POST', { product: 'p1', action: 'include' }), params)).status).toBe(422)
    vi.mocked(admin_.updateBrandLine).mockRejectedValueOnce(new BrandLineAdminError('line_cycle', 422))
    expect((await lineRoute.PATCH(req('PATCH', { parentId: 'x' }), params)).status).toBe(422)
    await lineRoute.GET(req('GET'), params)
    state.user = { id: 'm1', email: 'manager@example.test', platformRole: 'user', teamRole: 'manager' } as never
    expect((await lineRoute.PATCH(req('PATCH', { slug: 'y' }), params)).status).toBe(403)
    expect(revalidateTag).not.toHaveBeenCalled()
  })
})
