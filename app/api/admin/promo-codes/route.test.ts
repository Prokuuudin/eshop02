import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { txMock } = vi.hoisted(() => ({ txMock: vi.fn() }))

vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    promoCode: { findMany: vi.fn(), findUnique: vi.fn() },
    brandLine: { findMany: vi.fn() },
    $transaction: txMock,
  },
}))

import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/promo-codes', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  txMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({
    promoCode: { create: vi.fn((args: { data: unknown }) => args.data) },
  }))
})

describe('POST /api/admin/promo-codes', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await POST(makeRequest({ code: 'X', discount: 10 }))
    expect(res.status).toBe(403)
  })

  it('clamps a discount above 100 instead of storing it verbatim', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(null as never)

    const res = await POST(makeRequest({ code: 'MEGA', discount: 500 }))
    const body = await res.json()

    expect(res.status).toBe(201)
    expect(body.discount).toBe(100)
  })

  it('clamps a negative discount to zero', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(null as never)

    const res = await POST(makeRequest({ code: 'NEG', discount: -20 }))
    const body = await res.json()

    expect(body.discount).toBe(0)
  })

  it('clamps a negative minOrder/usedCount to zero', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(null as never)

    const res = await POST(makeRequest({ code: 'NEG2', discount: 10, minOrder: -50, usedCount: -3 }))
    const body = await res.json()

    expect(body.minOrder).toBe(0)
    expect(body.usedCount).toBe(0)
  })

  it('rejects a duplicate code', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue({ code: 'DUP' } as never)

    const res = await POST(makeRequest({ code: 'DUP', discount: 10 }))

    expect(res.status).toBe(409)
  })

  it('rejects unknown BrandLine ids and preserves valid stable ids', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.brandLine.findMany).mockResolvedValue([] as never)
    const invalid = await POST(makeRequest({ code: 'LINE10', discount: 10, appliesTo: 'brand_lines', brandLineIds: ['missing'] }))
    expect(invalid.status).toBe(422)
    await expect(invalid.json()).resolves.toEqual({ error: 'invalid_brand_lines', ids: ['missing'] })

    vi.mocked(prisma.brandLine.findMany).mockResolvedValue([{ id: 'stable-line-id' }] as never)
    const valid = await POST(makeRequest({ code: 'LINE10', discount: 10, appliesTo: 'brand_lines', brandLineIds: ['stable-line-id'] }))
    expect(valid.status).toBe(201)
    await expect(valid.json()).resolves.toMatchObject({ brandLineIds: ['stable-line-id'] })
  })
})
