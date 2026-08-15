import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { txMock } = vi.hoisted(() => ({ txMock: vi.fn() }))

vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ requireAdmin: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    promoCode: { findUnique: vi.fn() },
    $transaction: txMock,
  },
}))

import { requireAdmin } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { PUT, DELETE } from './route'

const ADMIN_USER = { id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' }
const EXISTING = { id: 'pc-1', code: 'WELCOME10', discount: 10, minOrder: 0, maxUses: null, usedCount: 0, active: true, description: '' }

function makeRequest(method: 'PUT' | 'DELETE', body?: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/promo-codes/pc-1', {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json' },
  })
}

const params = { params: Promise.resolve({ id: 'pc-1' }) }

beforeEach(() => {
  vi.clearAllMocks()
  txMock.mockImplementation(async (cb: (tx: unknown) => unknown) => cb({
    promoCode: {
      update: vi.fn((args: { data: unknown }) => ({ ...EXISTING, ...(args.data as object) })),
      delete: vi.fn(),
    },
  }))
})

describe('PUT /api/admin/promo-codes/[id]', () => {
  it('rejects non-admins', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await PUT(makeRequest('PUT', { discount: 20 }), params)
    expect(res.status).toBe(403)
  })

  it('404s on an unknown id', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(null as never)
    const res = await PUT(makeRequest('PUT', { discount: 20 }), params)
    expect(res.status).toBe(404)
  })

  it('clamps an out-of-range discount on update', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(EXISTING as never)

    const res = await PUT(makeRequest('PUT', { discount: 250 }), params)
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.discount).toBe(100)
  })
})

describe('DELETE /api/admin/promo-codes/[id]', () => {
  it('404s on an unknown id', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(null as never)
    const res = await DELETE(makeRequest('DELETE'), params)
    expect(res.status).toBe(404)
  })

  it('deletes an existing code', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(ADMIN_USER as never)
    vi.mocked(prisma.promoCode.findUnique).mockResolvedValue(EXISTING as never)
    const res = await DELETE(makeRequest('DELETE'), params)
    expect(res.status).toBe(200)
  })
})
