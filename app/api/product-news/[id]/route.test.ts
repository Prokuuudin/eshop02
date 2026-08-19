import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    productNewsSubscription: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { PATCH, DELETE } from './route'

const context = { params: Promise.resolve({ id: 'sub-b' }) }
const patch = (body: unknown) => PATCH(new NextRequest('https://shop.test/api/product-news/sub-b', {
  method: 'PATCH', body: JSON.stringify(body),
}), context)
const del = () => DELETE(new NextRequest('https://shop.test/api/product-news/sub-b', { method: 'DELETE' }), context)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'user-a', email: 'a@example.com' } as never)
})

describe('PATCH /api/product-news/:id', () => {
  it('rejects an IDOR update', async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({
      id: 'sub-b', userId: 'user-b', notifyPrice: true, notifyStock: true, notifyPromo: true,
    } as never)
    const res = await patch({ notifyPrice: false })
    expect(res.status).toBe(403)
    expect(prisma.productNewsSubscription.update).not.toHaveBeenCalled()
  })

  it('rejects turning every flag off', async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({
      id: 'sub-b', userId: 'user-a', notifyPrice: true, notifyStock: false, notifyPromo: false,
    } as never)
    const res = await patch({ notifyPrice: false })
    expect(res.status).toBe(400)
    expect(prisma.productNewsSubscription.update).not.toHaveBeenCalled()
  })

  it("updates the owner's own subscription", async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({
      id: 'sub-b', userId: 'user-a', notifyPrice: true, notifyStock: true, notifyPromo: true,
    } as never)
    const res = await patch({ notifyPrice: false })
    expect(res.status).toBe(200)
    expect(prisma.productNewsSubscription.update).toHaveBeenCalledWith({
      where: { id: 'sub-b' }, data: { notifyPrice: false },
    })
  })
})

describe('DELETE /api/product-news/:id', () => {
  it('rejects an IDOR delete', async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({ id: 'sub-b', userId: 'user-b' } as never)
    const res = await del()
    expect(res.status).toBe(403)
    expect(prisma.productNewsSubscription.delete).not.toHaveBeenCalled()
  })

  it("deletes the owner's own subscription", async () => {
    vi.mocked(prisma.productNewsSubscription.findUnique).mockResolvedValue({ id: 'sub-b', userId: 'user-a' } as never)
    const res = await del()
    expect(res.status).toBe(200)
    expect(prisma.productNewsSubscription.delete).toHaveBeenCalledWith({ where: { id: 'sub-b' } })
  })
})
