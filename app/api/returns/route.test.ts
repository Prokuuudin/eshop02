import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const tx = {
  order: { findUnique: vi.fn() },
  returnRequest: { findMany: vi.fn(), create: vi.fn() },
}

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { getServerUser } from '@/lib/server-auth'
import { POST } from './route'

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
