import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { queryRawMock, requireAdminPermissionMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(), requireAdminPermissionMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRawMock } }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: requireAdminPermissionMock }))

import { GET } from './route'

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminPermissionMock.mockResolvedValue({ id: 'admin-1', platformRole: 'admin' })
})

describe('GET /api/admin/analytics/abc', () => {
  it('returns a paginated page and full-dataset summary', async () => {
    queryRawMock.mockResolvedValueOnce([{
      rows: [{ id: 'p26', title: 'Mask', brand: 'Brand', qty: 2, revenue: 30, revenuePct: 0.1, cumPct: 0.9, grade: 'B' }],
      total: 31,
      summary: { A: { count: 8, revenue: 800 }, B: { count: 5, revenue: 150 } },
    }])

    const response = await GET(new NextRequest('http://localhost/api/admin/analytics/abc?page=2&pageSize=25&grade=B&search=mask'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({ page: 2, pageSize: 25, total: 31 })
    expect(body.rows).toHaveLength(1)
    expect(body.summary).toEqual({ A: { count: 8, revenue: 800 }, B: { count: 5, revenue: 150 }, C: { count: 0, revenue: 0 } })
    expect(queryRawMock).toHaveBeenCalledTimes(1)
  })

  it('caps page size at 100', async () => {
    queryRawMock.mockResolvedValueOnce([{ rows: [], total: 0, summary: {} }])
    const response = await GET(new NextRequest('http://localhost/api/admin/analytics/abc?pageSize=999'))
    expect((await response.json()).pageSize).toBe(100)
  })

  it('classifies a row by the cumulative share before that row', async () => {
    queryRawMock.mockResolvedValueOnce([{ rows: [], total: 0, summary: {} }])
    await GET(new NextRequest('http://localhost/api/admin/analytics/abc'))
    const sql = queryRawMock.mock.calls[0][0]
    expect(sql.strings.join(' ')).toContain('"cumPct" - "revenuePct" < 0.8')
  })

  it('exports the filtered report as UTF-8 CSV', async () => {
    queryRawMock.mockResolvedValueOnce([{ rows: [{ id: 'p1', title: 'Mask', brand: 'Brand', qty: 2, revenue: 30, revenuePct: 1, cumPct: 1, grade: 'A' }], total: 1, summary: { A: { count: 1, revenue: 30 } } }])
    const response = await GET(new NextRequest('http://localhost/api/admin/analytics/abc?period=30d&export=csv'))
    expect(response.headers.get('content-type')).toContain('text/csv')
    expect(response.headers.get('content-disposition')).toContain('abc-analysis-30d.csv')
    expect(await response.text()).toContain('Mask')
  })
})
