import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const tx = {
  order: { findUnique: vi.fn() },
  returnRequest: { findMany: vi.fn(), create: vi.fn() },
}

// vi.mock factories are hoisted above regular top-level statements, so any
// value referenced *directly* inside one (not deferred inside a nested
// closure, like `tx` is above via `(callback) => callback(tx)`) must itself
// be created with vi.hoisted to avoid a TDZ ReferenceError.
const returnRequestTop = vi.hoisted(() => ({ findMany: vi.fn(), count: vi.fn() }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
    returnRequest: returnRequestTop,
  },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { getServerUser } from '@/lib/server-auth'
import { GET, POST } from './route'

const request = (items: Array<{ productId: string; quantity: number }>) => new NextRequest(
  'http://localhost/api/returns',
  { method: 'POST', body: JSON.stringify({ orderId: 'o1', reason: 'defective', items }) },
)

describe('POST /api/returns reservations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({ email: 'buyer@example.com', platformRole: 'customer' } as never)
    tx.order.findUnique.mockResolvedValue({
      id: 'o1', email: 'buyer@example.com', items: [{ id: 'p1', price: 10, quantity: 3 }],
    })
    tx.returnRequest.create.mockResolvedValue({ id: 'r-new' })
  })

  it('includes quantities reserved by earlier returns', async () => {
    tx.returnRequest.findMany.mockResolvedValue([{ items: [{ productId: 'p1', quantity: 2 }] }])
    const response = await POST(request([{ productId: 'p1', quantity: 2 }]))
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ error: 'quantity_exceeds_order', productId: 'p1' })
    expect(tx.returnRequest.create).not.toHaveBeenCalled()
  })

  it('aggregates duplicate product rows in the same request', async () => {
    tx.returnRequest.findMany.mockResolvedValue([])
    const response = await POST(request([
      { productId: 'p1', quantity: 2 }, { productId: 'p1', quantity: 2 },
    ]))
    expect(response.status).toBe(400)
    expect(tx.returnRequest.create).not.toHaveBeenCalled()
  })
})

describe('GET /api/returns', () => {
  const sampleRow = {
    id: 'r1', orderId: 'o1', createdAt: new Date('2026-01-01T00:00:00.000Z'),
    status: 'pending', reason: 'defective', comment: null, items: [],
    refundAmount: 10, firstName: 'A', lastName: 'B', email: 'customer@example.com',
    phone: '', resolution: null, resolvedAt: null,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    returnRequestTop.findMany.mockResolvedValue([sampleRow])
    returnRequestTop.count.mockResolvedValue(1)
  })

  it('admin with no ?email= gets the unfiltered list (existing /admin/returns behavior unchanged)', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ email: 'admin@example.com', platformRole: 'admin' } as never)
    const response = await GET(new NextRequest('http://localhost/api/returns?take=200'))
    expect(response.status).toBe(200)
    expect(returnRequestTop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
  })

  it('admin with ?email= scopes the query to that customer', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ email: 'admin@example.com', platformRole: 'admin' } as never)
    const response = await GET(new NextRequest('http://localhost/api/returns?email=Customer@Example.com'))
    expect(response.status).toBe(200)
    expect(returnRequestTop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: { equals: 'customer@example.com', mode: 'insensitive' } } })
    )
    const body = await response.json() as { returns: Array<{ email: string }> }
    expect(body.returns).toHaveLength(1)
    expect(body.returns[0].email).toBe('customer@example.com')
  })

  it('non-admin is always scoped to their own email, ignoring ?email=', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ email: 'buyer@example.com', platformRole: 'customer' } as never)
    await GET(new NextRequest('http://localhost/api/returns?email=someone-else@example.com'))
    expect(returnRequestTop.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { email: 'buyer@example.com' } })
    )
  })

  it('rejects unauthenticated requests', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const response = await GET(new NextRequest('http://localhost/api/returns'))
    expect(response.status).toBe(401)
    expect(returnRequestTop.findMany).not.toHaveBeenCalled()
  })
})
