import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from './route'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    userNotification: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}))

import { getServerUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'

function makeRequest(): NextRequest {
  return new NextRequest('http://localhost/api/notifications/inbox')
}

describe('GET /api/notifications/inbox', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
    expect(prisma.userNotification.findMany).not.toHaveBeenCalled()
  })

  it('returns empty array when no pending notifications', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    vi.mocked(prisma.userNotification.findMany as any).mockResolvedValue([])
    vi.mocked(prisma.userNotification.updateMany as any).mockResolvedValue({ count: 0 })
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.notifications).toEqual([])
  })

  it('returns pending notifications and marks them delivered', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    const dbRows = [
      { id: 'n1', type: 'info',    title: 'Hello', message: 'World',  link: null,       createdAt: new Date('2025-01-01') },
      { id: 'n2', type: 'success', title: 'Done',  message: 'OK',     link: '/account', createdAt: new Date('2025-01-02') },
    ]
    vi.mocked(prisma.userNotification.findMany as any).mockResolvedValue(dbRows)
    vi.mocked(prisma.userNotification.updateMany as any).mockResolvedValue({ count: 2 })
    const res = await GET(makeRequest())
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.notifications).toHaveLength(2)
    expect(json.notifications[0]).toMatchObject({ type: 'info', title: 'Hello', message: 'World' })
    expect(json.notifications[1]).toMatchObject({ link: '/account' })
    expect(prisma.userNotification.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', id: { in: ['n1', 'n2'] } },
      data: { appDelivered: true },
    })
  })

  it('does not call updateMany when no rows returned', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com' } as any)
    vi.mocked(prisma.userNotification.findMany as any).mockResolvedValue([])
    const res = await GET(makeRequest())
    expect(res.status).toBe(200)
    expect(prisma.userNotification.updateMany).not.toHaveBeenCalled()
  })
})
