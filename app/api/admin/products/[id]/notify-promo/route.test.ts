import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { product: { findUnique: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn() }))
vi.mock('@/lib/product-news-notify', () => ({ notifyPromo: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdminPermission } from '@/lib/server-auth'
import { notifyPromo } from '@/lib/product-news-notify'
import { POST } from './route'

const context = { params: Promise.resolve({ id: 'p1' }) }
const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/admin/products/p1/notify-promo', {
  method: 'POST', body: JSON.stringify(body),
}), context)

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue({ id: 'admin-1' } as never)
  vi.mocked(prisma.product.findUnique).mockResolvedValue({ id: 'p1', title: 'Shampoo', isDeleted: false } as never)
})

describe('POST /api/admin/products/:id/notify-promo', () => {
  it('rejects a caller without catalog.update permission', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await post({})
    expect(res.status).toBe(403)
    expect(notifyPromo).not.toHaveBeenCalled()
  })

  it('404s for a missing or deleted product', async () => {
    vi.mocked(prisma.product.findUnique).mockResolvedValue(null)
    const res = await post({})
    expect(res.status).toBe(404)
  })

  it('forwards the trimmed message to notifyPromo', async () => {
    const res = await post({ message: '  Скидка 20%  ' })
    expect(res.status).toBe(200)
    expect(notifyPromo).toHaveBeenCalledWith('p1', 'Shampoo', '  Скидка 20%  '.slice(0, 500))
  })
})
