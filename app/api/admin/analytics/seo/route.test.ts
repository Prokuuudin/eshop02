import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { queryRawMock, requireAdminPermissionMock, getProductOverridesMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(), requireAdminPermissionMock: vi.fn(), getProductOverridesMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRawMock } }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: requireAdminPermissionMock }))
vi.mock('@/lib/product-overrides-store', () => ({ getProductOverrides: getProductOverridesMock }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminPermissionMock.mockResolvedValue({ id: 'admin-1', platformRole: 'admin' })
  getProductOverridesMock.mockResolvedValue({ p1: { metaTitle: 'Override title' } })
})

describe('GET /api/admin/analytics/seo', () => {
  it('paginates and filters in SQL while passing overrides to the query', async () => {
    queryRawMock.mockResolvedValueOnce([{
      products: [{ id: 'p1', title: 'Mask', brand: 'Brand', category: 'care', hasMetaTitle: true, hasMetaDesc: false, hasImage: true }],
      total: 26,
      catalogTotal: 100,
      counts: { all: 40, metaTitle: 10, metaDesc: 26, image: 8 },
    }])

    const response = await GET(new NextRequest('http://localhost/api/admin/analytics/seo?issue=metaDesc&page=2&pageSize=25'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ page: 2, pageSize: 25, total: 26, catalogTotal: 100 })
    expect(queryRawMock).toHaveBeenCalledTimes(1)
    const query = queryRawMock.mock.calls[0][0]
    expect(query.strings.join(' ')).toContain('SELECT * FROM analyzed WHERE')
    expect(query.strings.join(' ')).toContain('validMetaTitleLength')
    expect(query.strings.join(' ')).toContain('duplicateMeta')
    expect(query.values).toContain(JSON.stringify({ p1: { metaTitle: 'Override title' } }))
  })
})
