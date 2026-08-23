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
  return new NextRequest(`http://localhost/api/admin/sales/breakdown${qs}`)
}

function mockAllQueries(): void {
  queryRawMock
    .mockResolvedValueOnce([{ orderCount: 10, totalRevenue: 1000 }]) // totals
    .mockResolvedValueOnce([{ totalQty: 40, uniqueProducts: 12 }]) // item totals
    .mockResolvedValueOnce([{ id: 'p1', title: 'Shampoo', brand: 'Acme', qty: 5, revenue: 250 }]) // products by revenue
    .mockResolvedValueOnce([{ id: 'p2', title: 'Conditioner', brand: 'Acme', qty: 9, revenue: 90 }]) // products by qty
    .mockResolvedValueOnce([{ brand: 'Acme', qty: 14, revenue: 340 }]) // brands by revenue
    .mockResolvedValueOnce([{ brand: 'Acme', qty: 14, revenue: 340 }]) // brands by qty
    .mockResolvedValueOnce([{ cat: 'hair', qty: 14, revenue: 340 }]) // category summary
    .mockResolvedValueOnce([{ month: new Date('2026-08-01'), cat: 'hair', qty: 14, revenue: 340 }]) // trend
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/sales/breakdown', () => {
  it('rejects non-admins', async () => {
    requireAdminPermissionMock.mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 })
    )

    const res = await GET(makeRequest())

    expect(res.status).toBe(403)
    expect(queryRawMock).not.toHaveBeenCalled()
  })

  it('returns totals and both revenue/qty rankings for the default period', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    mockAllQueries()

    const res = await GET(makeRequest())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.orderCount).toBe(10)
    expect(body.totalRevenue).toBe(1000)
    expect(body.totalQty).toBe(40)
    expect(body.uniqueProducts).toBe(12)
    expect(body.topProductsByRevenue).toEqual([{ id: 'p1', title: 'Shampoo', brand: 'Acme', qty: 5, revenue: 250 }])
    expect(body.topProductsByQty).toEqual([{ id: 'p2', title: 'Conditioner', brand: 'Acme', qty: 9, revenue: 90 }])
    expect(body.categorySummary).toEqual([{ cat: 'hair', qty: 14, revenue: 340 }])
    expect(body.categoryTrend).toEqual([{ month: '2026-08', cat: 'hair', qty: 14, revenue: 340 }])
    expect(queryRawMock).toHaveBeenCalledTimes(8)
  })

  it('accepts period=all without a date cutoff', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    mockAllQueries()

    const res = await GET(makeRequest('?period=all'))

    expect(res.status).toBe(200)
    expect(queryRawMock).toHaveBeenCalledTimes(8)
  })

  it('returns a 500 on query failure', async () => {
    requireAdminPermissionMock.mockResolvedValue(ADMIN_USER)
    queryRawMock.mockRejectedValueOnce(new Error('db down'))

    const res = await GET(makeRequest())

    expect(res.status).toBe(500)
  })
})
