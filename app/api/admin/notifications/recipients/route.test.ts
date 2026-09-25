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
    findManyMock.mockResolvedValue([{ id: 'customer-150', email: 'found@example.com', name: 'Found', phone: null, cardNumber: null, notificationChannel: 'email', notificationsSubscribed: true }])
    countMock.mockResolvedValue(151)
  })

  it('searches only registered customers and excludes technical addresses', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/notifications/recipients?search=found&skip=100&take=50'))
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ total: 151, skip: 100, take: 50 })
    expect(findManyMock).toHaveBeenCalledWith(expect.objectContaining({
      skip: 100, take: 50,
      where: expect.objectContaining({
        platformRole: 'customer',
        mustChangePassword: false,
        NOT: [
          { email: { endsWith: '@client.local', mode: 'insensitive' } },
          { email: { endsWith: '@deleted.invalid', mode: 'insensitive' } },
        ],
        OR: expect.any(Array),
      }),
    }))
    expect(findManyMock.mock.calls[0]?.[0]?.select).toMatchObject({ notificationChannel: true, notificationsSubscribed: true })
    expect(findManyMock.mock.calls[0]?.[0]?.where).not.toHaveProperty('notificationsSubscribed')
  })

  it.each([
    ['email', { notificationsSubscribed: true, notificationChannel: 'email' }],
    ['app', { notificationsSubscribed: true, notificationChannel: 'app' }],
    ['both', { notificationsSubscribed: true, notificationChannel: 'both' }],
    ['disabled', { notificationsSubscribed: false }],
  ])('filters recipients by %s delivery preference', async (delivery, expected) => {
    const response = await GET(new NextRequest(`http://localhost/api/admin/notifications/recipients?delivery=${delivery}`))
    expect(response.status).toBe(200)
    expect(findManyMock.mock.calls[0]?.[0]?.where).toMatchObject(expected)
  })

  it('rejects an unknown delivery filter', async () => {
    const response = await GET(new NextRequest('http://localhost/api/admin/notifications/recipients?delivery=sms'))
    expect(response.status).toBe(400)
    expect(findManyMock).not.toHaveBeenCalled()
  })
})
