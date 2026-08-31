import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { permissionMock, transactionMock, findManyMock, countMock } = vi.hoisted(() => ({
  permissionMock: vi.fn(), transactionMock: vi.fn(), findManyMock: vi.fn(), countMock: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transactionMock, product: { findMany: findManyMock, count: countMock } } }))
import { GET } from './route'

describe('GET /api/admin/stock-alerts', () => {
  beforeEach(() => { vi.clearAllMocks(); permissionMock.mockResolvedValue({ id: 'admin' }) })
  it('requires catalog.read permission before querying products', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await GET(new NextRequest('https://shop.test/api/admin/stock-alerts'))).status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })
  it('clamps pagination and builds a low-stock search filter', async () => {
    transactionMock.mockResolvedValue([[{ id: 'p1', title: 'T', brand: 'B', category: 'hair', stock: 2, sku: 'S', price: 10, externalId: null }], 1, 10, 2, 3, 4])
    const response = await GET(new NextRequest('https://shop.test/api/admin/stock-alerts?page=-2&limit=999&threshold=5&q=test&hideUnconfirmed=true'))
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json).toMatchObject({ page: 1, limit: 100, total: 1, lowCount: 3 })
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({ take: 100, skip: 0, where: expect.objectContaining({
      stock: { gt: 0, lte: 5 }, externalId: { not: null },
    }) }))
    expect(json.products[0]).toMatchObject({ price: 10, synced: false })
  })
})
