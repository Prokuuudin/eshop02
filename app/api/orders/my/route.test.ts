import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerUserMock, findManyMock } = vi.hoisted(() => ({
  getServerUserMock: vi.fn(),
  findManyMock: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { order: { findMany: findManyMock } } }))

import { GET } from './route'

const request = (query = '') => new NextRequest(`https://shop.test/api/orders/my${query}`)

describe('GET /api/orders/my', () => {
  beforeEach(() => vi.clearAllMocks())

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
