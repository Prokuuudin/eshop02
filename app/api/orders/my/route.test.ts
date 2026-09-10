import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerUserMock, findManyMock, statusFindManyMock } = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
  findManyMock: vi.fn(),
  statusFindManyMock: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  order: { findMany: findManyMock },
  orderStatusRecord: { findMany: statusFindManyMock },
} }))

import { GET } from './route'

const request = (query = '') => new NextRequest(`https://shop.test/api/orders/my${query}`)

describe('GET /api/orders/my', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    statusFindManyMock.mockResolvedValue([])
  })

  it('does not query orders for an anonymous caller', async () => {
    getServerUserMock.mockResolvedValue(null)
    expect((await GET(request())).status).toBe(401)
    expect(findManyMock).not.toHaveBeenCalled()
  })

  it('scopes by both immutable user id and the account email', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'buyer@test.com' })
    findManyMock.mockResolvedValue([{ id: 'o1', createdAt: new Date('2026-01-01') }])
    const response = await GET(request('?take=25'))
    expect(response.status).toBe(200)
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { OR: [{ userId: 'u1' }, { email: 'buyer@test.com' }] },
      take: 26,
    }))
  })

  it('returns the server fulfilment status and defaults sparse records to pending', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'buyer@test.com' })
    findManyMock.mockResolvedValue([
      { id: 'o1', createdAt: new Date('2026-01-01') },
      { id: 'o2', createdAt: new Date('2026-01-02') },
    ])
    statusFindManyMock.mockResolvedValue([{ orderId: 'o1', status: 'delivered' }])

    const json = await (await GET(request())).json()

    expect(json.orders.map((order: { id: string; status: string }) => [order.id, order.status])).toEqual([
      ['o1', 'delivered'],
      ['o2', 'pending'],
    ])
  })

  it('caps page size and returns a cursor only when another row exists', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'buyer@test.com' })
    findManyMock.mockResolvedValue(Array.from({ length: 101 }, (_, i) => ({ id: `o${i}`, createdAt: new Date() })))
    const response = await GET(request('?take=999&cursor=previous'))
    const json = await response.json()
    expect(json.orders).toHaveLength(100)
    expect(json.nextCursor).toBe('o99')
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      take: 101, cursor: { id: 'previous' }, skip: 1,
    }))
  })
})
