import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    brandLine: { findMany: vi.fn() },
    productBrandLine: { findMany: vi.fn() },
    product: { count: vi.fn(), findMany: vi.fn(), fields: { price: 'price' } },
  },
}))

import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

function request(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/admin/promo-products-preview', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdmin).mockResolvedValue({ id: 'admin', platformRole: 'admin' } as never)
})

describe('promo products preview BrandLine scope', () => {
  it('keeps the admin gate', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await POST(request({ appliesTo: 'brand_lines', brandLineIds: ['line'] }))).status).toBe(403)
  })

  it('returns zero for an empty product-line scope instead of the whole catalog', async () => {
    const response = await POST(request({ appliesTo: 'brand_lines', brandLineIds: [] }))
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ total: 0, products: [] })
    expect(prisma.product.count).not.toHaveBeenCalled()
  })

  it('limits a rules preview to the one product linked to the selected line', async () => {
    vi.mocked(prisma.brandLine.findMany).mockResolvedValue([{ id: 'line', parentId: null }] as never)
    vi.mocked(prisma.productBrandLine.findMany).mockResolvedValue([
      { productId: '19490', brandLineId: 'line', status: 'active' },
    ] as never)
    vi.mocked(prisma.product.count).mockResolvedValue(1)
    vi.mocked(prisma.product.findMany).mockResolvedValue([
      { id: '19490', title: 'Keratin Protein', brand: 'BLACK PROFESSIONAL', image: null, isActive: true },
    ] as never)

    const response = await POST(request({ appliesTo: 'rules', brandLineIds: ['line'] }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({ total: 1, products: [{ id: '19490' }] })
    expect(prisma.product.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isDeleted: false,
        isActive: true,
        AND: [{ id: { in: ['19490'] } }],
      }),
    })
  })

  it('combines line, category, subcategory and brand groups with AND semantics', async () => {
    vi.mocked(prisma.brandLine.findMany).mockResolvedValue([{ id: 'line', parentId: null }] as never)
    vi.mocked(prisma.productBrandLine.findMany).mockResolvedValue([
      { productId: '19490', brandLineId: 'line', status: 'active' },
    ] as never)
    vi.mocked(prisma.product.count).mockResolvedValue(1)
    vi.mocked(prisma.product.findMany).mockResolvedValue([])

    await POST(request({
      appliesTo: 'rules',
      brandLineIds: ['line'],
      categories: ['hair'],
      subcategories: ['shampoos'],
      brands: ['BLACK PROFESSIONAL'],
    }))

    const where = vi.mocked(prisma.product.count).mock.calls[0]?.[0]?.where
    expect(where).toBeDefined()
    expect(where).toMatchObject({
      category: { in: ['hair'] },
      brand: { in: ['BLACK PROFESSIONAL'], mode: 'insensitive' },
    })
    expect(where?.AND).toEqual(expect.arrayContaining([
      { id: { in: ['19490'] } },
      expect.objectContaining({ id: expect.objectContaining({ in: expect.any(Array) }) }),
    ]))
  })
})
