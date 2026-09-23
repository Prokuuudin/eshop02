import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const permissionMock = vi.hoisted(() => vi.fn())
const findManyMock = vi.hoisted(() => vi.fn())
const countMock = vi.hoisted(() => vi.fn())
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { user: { findMany: findManyMock, count: countMock } } }))
import { GET } from './route'

describe('GET /api/admin/notifications/recipients', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue({ id: 'admin', platformRole: 'admin' })
    findManyMock.mockResolvedValue([{ id: 'customer-150', email: 'found@example.com', name: 'Found', phone: null, cardNumber: null }])
    countMock.mockResolvedValue(151)
  })

  it('uses server search and pagination while excluding admins and unsubscribed users', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/notifications/recipients?search=found&skip=100&take=50'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ total: 151, skip: 100, take: 50 })
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      skip: 100, take: 50,
      where: expect.objectContaining({ platformRole: 'customer', notificationsSubscribed: true, OR: expect.any(Array) }),
    }))
  })
})
