import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const tx = vi.hoisted(() => ({ rFQRequest: { update: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  rFQRequest: { findUnique: vi.fn() },
  $transaction: vi.fn((callback: (client: typeof tx) => unknown) => callback(tx)),
  user: { findMany: vi.fn().mockResolvedValue([]) },
  companyMember: { findMany: vi.fn().mockResolvedValue([]) },
  userNotification: { createMany: vi.fn() },
} }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/admin-permissions', () => ({ hasAdminPermission: vi.fn(() => false) }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { hasAdminPermission } from '@/lib/admin-permissions'
import { GET, PATCH } from './route'

const context = { params: Promise.resolve({ id: 'rfq-b' }) }
const rfq = { id: 'rfq-b', companyId: 'company-b', status: 'quoted', quote: { validUntil: '2099-01-01T00:00:00.000Z' }, timeline: [], notes: 'customer note', createdAt: new Date(), updatedAt: new Date() }

describe('/api/rfq/:id tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-a', companyId: 'company-a' } as never)
    vi.mocked(prisma.rFQRequest.findUnique).mockResolvedValue(rfq as never)
    vi.mocked(hasAdminPermission).mockReturnValue(false)
    tx.rFQRequest.update.mockImplementation(async ({ data }: { data: object }) => ({ ...rfq, ...data, updatedAt: new Date() }))
  })

  it('blocks cross-tenant reads', async () => {
    expect((await GET(new NextRequest('https://shop.test/api/rfq/rfq-b'), context)).status).toBe(403)
  })

  it('blocks cross-tenant updates before a transaction starts', async () => {
    const response = await PATCH(new NextRequest('https://shop.test/api/rfq/rfq-b', {
      method: 'PATCH', body: JSON.stringify({ action: 'respond', decision: 'accepted' }),
    }), context)
    expect(response.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})

describe('/api/rfq/:id workflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({ id: 'buyer', companyId: 'company-b' } as never)
    vi.mocked(hasAdminPermission).mockReturnValue(false)
    vi.mocked(prisma.rFQRequest.findUnique).mockResolvedValue(rfq as never)
    tx.rFQRequest.update.mockImplementation(async ({ data }: { data: object }) => ({ ...rfq, ...data, updatedAt: new Date() }))
  })

  it('persists a customer acceptance and appends the event server-side', async () => {
    const response = await PATCH(new NextRequest('https://shop.test/api/rfq/rfq-b', {
      method: 'PATCH', body: JSON.stringify({ action: 'respond', decision: 'accepted' }),
    }), context)
    expect(response.status).toBe(200)
    expect(tx.rFQRequest.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: 'accepted', timeline: [expect.objectContaining({ type: 'accepted' })] }),
    }))
  })

  it('rejects acceptance of an expired quote', async () => {
    vi.mocked(prisma.rFQRequest.findUnique).mockResolvedValue({ ...rfq, quote: { validUntil: '2020-01-01T00:00:00.000Z' } } as never)
    const response = await PATCH(new NextRequest('https://shop.test/api/rfq/rfq-b', {
      method: 'PATCH', body: JSON.stringify({ action: 'respond', decision: 'accepted' }),
    }), context)
    expect(response.status).toBe(409)
    expect(tx.rFQRequest.update).not.toHaveBeenCalled()
  })

  it('does not allow staff to record the customer decision', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'admin', platformRole: 'admin' } as never)
    vi.mocked(hasAdminPermission).mockReturnValue(true)
    const response = await PATCH(new NextRequest('https://shop.test/api/rfq/rfq-b', {
      method: 'PATCH', body: JSON.stringify({ action: 'respond', decision: 'accepted' }),
    }), context)
    expect(response.status).toBe(403)
  })
})
