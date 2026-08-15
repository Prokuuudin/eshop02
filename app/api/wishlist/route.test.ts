import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { wishlistItem: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { DELETE, GET, POST } from './route'

describe('/api/wishlist ownership and retry behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-a' } as never)
  })

  it('scopes reads to the authenticated user', async () => {
    vi.mocked(prisma.wishlistItem.findMany).mockResolvedValue([])
    expect((await GET()).status).toBe(200)
    expect(prisma.wishlistItem.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'user-a' } }))
  })

  it('uses an idempotent user/product upsert', async () => {
    vi.mocked(prisma.wishlistItem.upsert).mockResolvedValue({} as never)
    const response = await POST(new NextRequest('https://shop.test/api/wishlist', {
      method: 'POST', body: JSON.stringify({ productId: 'product-1', userId: 'user-b' }),
    }))
    expect(response.status).toBe(200)
    expect(prisma.wishlistItem.upsert).toHaveBeenCalledWith({
      where: { userId_productId: { userId: 'user-a', productId: 'product-1' } },
      create: { userId: 'user-a', productId: 'product-1' }, update: {},
    })
  })

  it('cannot delete another user through a forged body userId', async () => {
    vi.mocked(prisma.wishlistItem.deleteMany).mockResolvedValue({ count: 0 })
    const response = await DELETE(new NextRequest('https://shop.test/api/wishlist', {
      method: 'DELETE', body: JSON.stringify({ productId: 'product-1', userId: 'user-b' }),
    }))
    expect(response.status).toBe(200)
    expect(prisma.wishlistItem.deleteMany).toHaveBeenCalledWith({ where: { userId: 'user-a', productId: 'product-1' } })
  })
})
