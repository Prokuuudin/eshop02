import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { stockNotification: { findUnique: vi.fn(), delete: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { DELETE } from './route'

const request = new NextRequest('https://shop.test/api/stock-notify/notification-b', { method: 'DELETE' })
const context = { params: Promise.resolve({ id: 'notification-b' }) }

describe('DELETE /api/stock-notify/:id ownership', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({
      id: 'user-a', email: 'shared@example.com', platformRole: 'customer',
    } as never)
  })

  it('does not downgrade to email ownership when the record belongs to another userId', async () => {
    vi.mocked(prisma.stockNotification.findUnique).mockResolvedValue({
      id: 'notification-b', userId: 'user-b', email: 'shared@example.com',
    } as never)

    const response = await DELETE(request, context)

    expect(response.status).toBe(403)
    expect(prisma.stockNotification.delete).not.toHaveBeenCalled()
  })

  it('allows the email fallback only for a legacy anonymous notification', async () => {
    vi.mocked(prisma.stockNotification.findUnique).mockResolvedValue({
      id: 'notification-b', userId: null, email: 'SHARED@example.com',
    } as never)
    vi.mocked(prisma.stockNotification.delete).mockResolvedValue({} as never)

    const response = await DELETE(request, context)

    expect(response.status).toBe(200)
    expect(prisma.stockNotification.delete).toHaveBeenCalledWith({ where: { id: 'notification-b' } })
  })
})
