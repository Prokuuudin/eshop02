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

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { PATCH } from './route'

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
  })
})
