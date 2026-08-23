import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { queryRawMock, requireAdminPermissionMock } = vi.hoisted(() => ({
  queryRawMock: vi.fn(), requireAdminPermissionMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({ prisma: { $queryRaw: queryRawMock } }))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: requireAdminPermissionMock }))

import { GET } from './route'

const request = (query = '') => new NextRequest(`http://localhost/api/admin/marketing/analytics${query}`)

beforeEach(() => vi.clearAllMocks())

describe('GET /api/admin/marketing/analytics', () => {
  it('rejects users without the required permission', async () => {
    requireAdminPermissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const response = await GET(request())
    expect(response.status).toBe(403)
    expect(queryRawMock).not.toHaveBeenCalled()
  })

  it('returns operational promo metrics', async () => {
    requireAdminPermissionMock.mockResolvedValue({ id: 'admin' })
    queryRawMock
      .mockResolvedValueOnce([{ totalWithPromo: 2, totalOrders: 10, totalDiscounts: 15, promoRevenue: 150, avgDiscountPercent: 10 }])
      .mockResolvedValueOnce([{ code: 'SAVE10', count: 2, totalDiscount: 15, revenue: 150, avgOrder: 75 }])
      .mockResolvedValueOnce([{ cat: 'hair', count: 3, totalDiscount: 15 }])
      .mockResolvedValueOnce([{ id: 'o1', email: 'a@example.com', promoCode: 'SAVE10', discount: 10, total: 90, createdAt: new Date('2026-08-01T10:00:00Z') }])

    const response = await GET(request('?period=90d'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.period).toBe('90d')
    expect(body.promoOrderShare).toBe(20)
    expect(body.discountToRevenue).toBe(10)
    expect(body.codeStats[0].revenue).toBe(150)
    expect(body.recentPromoOrders[0].createdAt).toBe('2026-08-01T10:00:00.000Z')
    expect(queryRawMock).toHaveBeenCalledTimes(4)
  })

  it('falls back to 30 days and avoids division by zero', async () => {
    requireAdminPermissionMock.mockResolvedValue({ id: 'admin' })
    queryRawMock.mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const body = await (await GET(request('?period=invalid'))).json()
    expect(body.period).toBe('30d')
    expect(body.promoOrderShare).toBe(0)
    expect(body.discountToRevenue).toBe(0)
  })

  it('returns 500 when aggregation fails', async () => {
    requireAdminPermissionMock.mockResolvedValue({ id: 'admin' })
    queryRawMock.mockRejectedValueOnce(new Error('db unavailable'))
    expect((await GET(request())).status).toBe(500)
  })
})
