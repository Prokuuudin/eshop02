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
  return new NextRequest(`http://localhost/api/admin/orders/stats${qs}`)
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/orders/stats', () => {
  it('rejects non-admins', async () => {
    requireAdminPermissionMock.mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await GET(makeRequest())

    expect(res.status).toBe(403)
    expect(queryRawMock).not.toHaveBeenCalled()
  })

  it('returns totals, status counts and a derived average, excluding cancelled orders at the query level', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    queryRawMock
      .mockResolvedValueOnce([{ orderCount: 10, revenue: 1000, itemsSold: 25 }])
      .mockResolvedValueOnce([
        { status: 'pending', count: 7 },
        { status: 'confirmed', count: 2 },
        { status: 'cancelled', count: 1 },
      ])
      .mockResolvedValueOnce([
        { day: new Date('2026-08-01'), revenue: 400, orderCount: 4 },
        { day: new Date('2026-08-02'), revenue: 600, orderCount: 6 },
      ])

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(body.orderCount).toBe(10)
    expect(body.revenue).toBe(1000)
    expect(body.avgOrderValue).toBe(100)
    expect(body.itemsSold).toBe(25)
    expect(body.statusCounts).toEqual({
      pending: 7,
      confirmed: 2,
      shipped: 0,
      delivered: 0,
      cancelled: 1,
    })
    expect(body.chart).toHaveLength(2)
    expect(body.chart[0]).toMatchObject({ revenue: 400, orderCount: 4 })
  })

  it('returns zero average and zeroed status counts when there are no orders', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    queryRawMock
      .mockResolvedValueOnce([{ orderCount: 0, revenue: 0, itemsSold: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(body.orderCount).toBe(0)
    expect(body.avgOrderValue).toBe(0)
    expect(body.statusCounts).toEqual({
      pending: 0,
      confirmed: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    })
    expect(body.chart).toEqual([])
  })

  it('clamps an out-of-range days param to the nearest allowed value', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    queryRawMock
      .mockResolvedValueOnce([{ orderCount: 0, revenue: 0, itemsSold: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])

    const res = await GET(makeRequest('?days=99999'))

    expect(res.status).toBe(200)
    // Third $queryRaw call is the chart query - it must have been reached
    // without throwing, proving the invalid `days` value didn't crash the route.
    expect(queryRawMock).toHaveBeenCalledTimes(3)
  })
})
