import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { productSubscription: { findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { PATCH } from './route'

const context = { params: Promise.resolve({ id: 'subscription-b' }) }
const patch = (body: unknown) => PATCH(new NextRequest('https://shop.test/api/subscriptions/subscription-b', {
  method: 'PATCH', body: JSON.stringify(body),
}), context)

describe('PATCH /api/subscriptions/:id ownership and validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({
      id: 'user-a', email: 'a@example.com', platformRole: 'customer',
    } as never)
    vi.mocked(prisma.productSubscription.findUnique).mockResolvedValue({
      id: 'subscription-b', userId: 'user-b',
    } as never)
  })

  it('rejects an IDOR update and leaves the record unchanged', async () => {
    const response = await patch({ status: 'cancelled' })

    expect(response.status).toBe(403)
    expect(prisma.productSubscription.update).not.toHaveBeenCalled()
  })

  it.each([
    [{ quantity: 0 }, 'invalid_quantity'],
    [{ quantity: 1.5 }, 'invalid_quantity'],
    [{ quantity: '2' }, 'invalid_quantity'],
    [{ nextOrderDate: 'not-a-date' }, 'invalid_nextOrderDate'],
  ])('returns 400 for invalid account input %o', async (body, error) => {
    vi.mocked(prisma.productSubscription.findUnique).mockResolvedValue({
      id: 'subscription-b', userId: 'user-a',
    } as never)

    const response = await patch(body)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toMatchObject({ error })
    expect(prisma.productSubscription.update).not.toHaveBeenCalled()
  })
})
