import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/admin-permissions', () => ({ hasAdminPermission: vi.fn().mockReturnValue(false) }))
vi.mock('@/lib/company-activity-log', () => ({ recordCompanyActivity: vi.fn().mockResolvedValue(undefined) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    rFQRequest: {
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn(),
    },
    product: { findMany: vi.fn().mockResolvedValue([{ id: 'p1', title: 'Product', sku: 'SKU-1', price: 10 }]) },
    user: { findMany: vi.fn().mockResolvedValue([]) },
    userNotification: { createMany: vi.fn() },
  },
}))

import { getServerUser } from '@/lib/server-auth'
import { prisma } from '@/lib/prisma'
import { recordCompanyActivity } from '@/lib/company-activity-log'
import { POST } from './route'

const post = (body: unknown) =>
  POST(new NextRequest('https://shop.test/api/rfq', { method: 'POST', body: JSON.stringify(body) }))

describe('POST /api/rfq', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.rFQRequest.findUnique).mockResolvedValue(null)
  })

  it('records company activity after creating an RFQ when the user has audit logging enabled', async () => {
    vi.mocked(getServerUser).mockResolvedValue({
      id: 'user-a', email: 'a@example.com', name: 'A', companyId: 'company-a', auditLoggingEnabled: true,
    } as never)
    vi.mocked(prisma.rFQRequest.create).mockResolvedValue({
      id: 'rfq-1', companyId: 'company-a', createdAt: new Date(), updatedAt: new Date(),
    } as never)

    const res = await post({ id: 'rfq-1', items: [{ productId: 'p1', quantity: 1 }] })
    expect(res.status).toBe(200)
    expect(recordCompanyActivity).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 'company-a', userId: 'user-a', action: 'rfq_created' })
    )
  })

  it('does not record company activity when the user has audit logging disabled', async () => {
    vi.mocked(getServerUser).mockResolvedValue({
      id: 'user-b', email: 'b@example.com', companyId: 'company-b', auditLoggingEnabled: false,
    } as never)
    vi.mocked(prisma.rFQRequest.create).mockResolvedValue({
      id: 'rfq-2', companyId: 'company-b', createdAt: new Date(), updatedAt: new Date(),
    } as never)

    const res = await post({ id: 'rfq-2', items: [{ productId: 'p1', quantity: 1 }] })
    expect(res.status).toBe(200)
    expect(recordCompanyActivity).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated requests without touching activity log', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await post({ id: 'rfq-3', items: [] })
    expect(res.status).toBe(401)
    expect(recordCompanyActivity).not.toHaveBeenCalled()
  })

  describe('body validation', () => {
    beforeEach(() => {
      vi.mocked(getServerUser).mockResolvedValue({
        id: 'user-a', email: 'a@example.com', companyId: 'company-a', auditLoggingEnabled: false,
      } as never)
    })

    it('rejects a non-array items field instead of writing a malformed RFQ to the DB', async () => {
      const res = await post({ id: 'rfq-x', items: 'not-an-array' })
      expect(res.status).toBe(400)
      expect(prisma.rFQRequest.create).not.toHaveBeenCalled()
    })

    it('rejects an item missing productId/quantity', async () => {
      const res = await post({ id: 'rfq-x', items: [{ quantity: 1 }] })
      expect(res.status).toBe(400)
      expect(prisma.rFQRequest.create).not.toHaveBeenCalled()
    })

    it('rejects a non-positive quantity', async () => {
      const res = await post({ id: 'rfq-x', items: [{ productId: 'p1', quantity: 0 }] })
      expect(res.status).toBe(400)
    })

    it('rejects notes longer than the cap', async () => {
      const res = await post({ id: 'rfq-x', items: [{ productId: 'p1', quantity: 1 }], notes: 'x'.repeat(5_001) })
      expect(res.status).toBe(400)
      expect(prisma.rFQRequest.create).not.toHaveBeenCalled()
    })

    it('still accepts an empty items array as a top-level array (min(1) rejects it, matching the old missing_fields check)', async () => {
      const res = await post({ id: 'rfq-x', items: [] })
      expect(res.status).toBe(400)
    })
  })
})
