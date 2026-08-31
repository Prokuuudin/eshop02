import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const current = {
  id: 'r1', email: 'buyer@example.com', status: 'approved',
  items: [{ productId: 'p1', quantity: 2 }],
  createdAt: new Date('2026-01-01'), resolvedAt: null,
}
const tx = {
  returnRequest: { updateMany: vi.fn(), findUniqueOrThrow: vi.fn(), update: vi.fn() },
  product: { updateMany: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    returnRequest: { findUnique: vi.fn() },
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { appendServerAudit } from '@/lib/server-audit'
import { GET, PATCH } from './route'

describe('PATCH /api/returns/:id stock restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({ email: 'admin@example.com', platformRole: 'admin' } as never)
    vi.mocked(prisma.returnRequest.findUnique).mockResolvedValue(current as never)
    tx.returnRequest.findUniqueOrThrow.mockResolvedValue(current)
  })

  it('does not restore stock when another request already made the terminal transition', async () => {
    tx.returnRequest.updateMany.mockResolvedValue({ count: 0 })
    const response = await PATCH(
      new NextRequest('http://localhost/api/returns/r1', {
        method: 'PATCH', body: JSON.stringify({ status: 'refunded' }),
      }),
      { params: Promise.resolve({ id: 'r1' }) },
    )
    expect(response.status).toBe(200)
    expect(tx.returnRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'r1', status: { notIn: ['approved', 'refunded'] } },
    }))
    expect(tx.product.updateMany).not.toHaveBeenCalled()
    expect(appendServerAudit).not.toHaveBeenCalled()
  })

  it('restores every valid item and writes one audit in the same transaction', async () => {
    vi.mocked(prisma.returnRequest.findUnique).mockResolvedValue({
      ...current, status: 'pending', items: [
        { productId: 'p1', quantity: 2 },
        { productId: 'p2', quantity: 1 },
      ],
    } as never)
    tx.returnRequest.updateMany.mockResolvedValue({ count: 1 })
    tx.product.updateMany.mockResolvedValue({ count: 1 })
    tx.returnRequest.findUniqueOrThrow.mockResolvedValue({ ...current, status: 'approved' })

    const response = await PATCH(new NextRequest('http://localhost/api/returns/r1', {
      method: 'PATCH', body: JSON.stringify({ status: 'approved' }),
    }), { params: Promise.resolve({ id: 'r1' }) })

    expect(response.status).toBe(200)
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(1, {
      where: { id: 'p1' }, data: { stock: { increment: 2 } },
    })
    expect(tx.product.updateMany).toHaveBeenNthCalledWith(2, {
      where: { id: 'p2' }, data: { stock: { increment: 1 } },
    })
    expect(appendServerAudit).toHaveBeenCalledOnce()
  })

  it('fails the transaction when any returned product no longer exists', async () => {
    vi.mocked(prisma.returnRequest.findUnique).mockResolvedValue({
      ...current, status: 'pending', items: [{ productId: 'missing', quantity: 1 }],
    } as never)
    tx.returnRequest.updateMany.mockResolvedValue({ count: 1 })
    tx.product.updateMany.mockResolvedValue({ count: 0 })

    const response = await PATCH(new NextRequest('http://localhost/api/returns/r1', {
      method: 'PATCH', body: JSON.stringify({ status: 'refunded' }),
    }), { params: Promise.resolve({ id: 'r1' }) })

    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'return_stock_restore_failed', productId: 'missing' })
    expect(appendServerAudit).not.toHaveBeenCalled()
  })

  it('hides another customer return on reads', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ email: 'other@example.com', platformRole: 'customer' } as never)
    const response = await GET(new NextRequest('http://localhost/api/returns/r1'), { params: Promise.resolve({ id: 'r1' }) })
    expect(response.status).toBe(403)
  })

  it('allows customers to change only their comment', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: current.email, platformRole: 'customer' } as never)
    tx.returnRequest.update.mockResolvedValue({ ...current, comment: 'updated' })
    const response = await PATCH(new NextRequest('http://localhost/api/returns/r1', {
      method: 'PATCH', body: JSON.stringify({ comment: 'updated', status: 'refunded', resolution: 'forged' }),
    }), { params: Promise.resolve({ id: 'r1' }) })
    expect(response.status).toBe(200)
    expect(tx.returnRequest.update).toHaveBeenCalledWith({ where: { id: 'r1' }, data: { comment: 'updated' } })
    expect(tx.product.updateMany).not.toHaveBeenCalled()
  })

  it('rejects a customer mutation containing no allowed fields', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: current.email, platformRole: 'customer' } as never)
    const response = await PATCH(new NextRequest('http://localhost/api/returns/r1', {
      method: 'PATCH', body: JSON.stringify({ status: 'refunded' }),
    }), { params: Promise.resolve({ id: 'r1' }) })
    expect(response.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
