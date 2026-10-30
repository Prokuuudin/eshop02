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
})
