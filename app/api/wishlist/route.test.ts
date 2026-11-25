import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { ownerRows } = vi.hoisted(() => ({ ownerRows: { current: [{ id: 'user-a' }] as Array<{ id: string }> } }))
vi.mock('@/lib/prisma', () => {
  const prisma: Record<string, unknown> = {
    wishlistItem: { findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
    $queryRaw: vi.fn(async () => ownerRows.current),
  }
  // The upsert runs in a transaction with the owner lock (lib/account-owner-lock).
  prisma.$transaction = vi.fn(async (run: (tx: unknown) => Promise<unknown>) => run(prisma))
  return { prisma }
})
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

  it('locks the owner row and adds nothing for an account merged away meanwhile', async () => {
    ownerRows.current = []
    const response = await POST(new NextRequest('https://shop.test/api/wishlist', {
      method: 'POST', body: JSON.stringify({ productId: 'product-1' }),
    }))
    ownerRows.current = [{ id: 'user-a' }]
    expect(response.status).toBe(401)
    expect(prisma.wishlistItem.upsert).not.toHaveBeenCalled()
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
