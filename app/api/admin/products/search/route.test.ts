import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn().mockResolvedValue({ id: 'admin' }) }))
vi.mock('@/lib/prisma', () => ({ prisma: { product: { findMany: vi.fn() } } }))

import { prisma } from '@/lib/prisma'
import { GET } from './route'

describe('GET /api/admin/products/search', () => {
  beforeEach(() => vi.clearAllMocks())

  it('searches by SKU and returns fields needed when adding an order item', async () => {
    vi.mocked(prisma.product.findMany).mockResolvedValue([{
      id: 'product-1',
      title: 'Repair Shampoo',
      brand: 'Pro',
      image: '/product.jpg',
      isActive: true,
      sku: 'RP-001',
      price: 12.5,
      stock: 7,
    }] as never)

    const response = await GET(new NextRequest('https://shop.test/api/admin/products/search?q=RP-001'))
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([{ sku: { contains: 'RP-001', mode: 'insensitive' } }]),
      }),
    }))
    expect(body.data.products).toEqual([expect.objectContaining({
      id: 'product-1', sku: 'RP-001', price: 12.5, stock: 7,
    })])
  })
})
