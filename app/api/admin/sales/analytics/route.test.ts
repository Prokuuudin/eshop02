import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { queryRawMock, requireAdminPermissionMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(),
  requireAdminPermissionMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: { $queryRaw: queryRawMock },
}))
vi.mock('@/lib/server-auth', () => ({
  requireAdminPermission: requireAdminPermissionMock,
}))

import { GET } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeRequest(qs = ''): NextRequest {
  return new NextRequest(`http://localhost/api/admin/sales/analytics${qs}`)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/sales/analytics', () => {
  it('rejects non-admins', async () => {
    requireAdminPermissionMock.mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await GET(makeRequest())

    expect(res.status).toBe(403)
    expect(queryRawMock).not.toHaveBeenCalled()
  })

  it('returns aggregated totals, charts and top lists for the default period', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    queryRawMock
      .mockResolvedValueOnce([{ orderCount: 10, revenue: 1000, uniqueCustomers: 6 }])
      .mockResolvedValueOnce([
        { day: new Date('2026-08-01'), revenue: 400, orderCount: 4 },
        { day: new Date('2026-08-02'), revenue: 600, orderCount: 6 },
      ])
      .mockResolvedValueOnce([{ id: 'p1', title: 'Shampoo', qty: 5, revenue: 250 }])
      .mockResolvedValueOnce([{ cat: 'hair', qty: 5, revenue: 250 }])

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.orderCount).toBe(10)
    expect(body.revenue).toBe(1000)
    expect(body.uniqueCustomers).toBe(6)
    expect(body.revenueByDay).toEqual([
      { date: '2026-08-01', value: 400 },
      { date: '2026-08-02', value: 600 },
    ])
    expect(body.ordersByDay).toEqual([
      { date: '2026-08-01', value: 4 },
      { date: '2026-08-02', value: 6 },
    ])
    expect(body.topProducts).toEqual([{ id: 'p1', title: 'Shampoo', qty: 5, revenue: 250 }])
    expect(body.topCategories).toEqual([{ cat: 'hair', qty: 5, revenue: 250 }])
    expect(queryRawMock).toHaveBeenCalledTimes(4)
  })

  it('falls back to 30d for an unknown period value', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    queryRawMock
      .mockResolvedValueOnce([{ orderCount: 0, revenue: 0, uniqueCustomers: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(makeRequest('?period=bogus'))

    expect(res.status).toBe(200)
    expect(queryRawMock).toHaveBeenCalledTimes(4)
  })

  it('accepts period=all without a date cutoff', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    queryRawMock
      .mockResolvedValueOnce([{ orderCount: 3, revenue: 300, uniqueCustomers: 2 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(makeRequest('?period=all'))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.orderCount).toBe(3)
  })

  it('returns a 500 on query failure', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    queryRawMock.mockRejectedValueOnce(new Error('db down'))

    const res = await GET(makeRequest())

    expect(res.status).toBe(500)
  })
})
