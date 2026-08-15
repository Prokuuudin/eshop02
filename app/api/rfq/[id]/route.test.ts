import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { rFQRequest: { findUnique: vi.fn() }, $transaction: vi.fn() } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/admin-permissions', () => ({ hasAdminPermission: vi.fn(() => false) }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { GET, PATCH } from './route'

const context = { params: Promise.resolve({ id: 'rfq-b' }) }
const rfq = { id: 'rfq-b', companyId: 'company-b', createdAt: new Date(), updatedAt: new Date() }

describe('/api/rfq/:id tenant isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-a', companyId: 'company-a' } as never)
    vi.mocked(prisma.rFQRequest.findUnique).mockResolvedValue(rfq as never)
  })

  it('blocks cross-tenant reads', async () => {
    expect((await GET(new NextRequest('https://shop.test/api/rfq/rfq-b'), context)).status).toBe(403)
  })

  it('blocks cross-tenant updates before a transaction starts', async () => {
    const response = await PATCH(new NextRequest('https://shop.test/api/rfq/rfq-b', {
      method: 'PATCH', body: JSON.stringify({ notes: 'forged' }),
    }), context)
    expect(response.status).toBe(403)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
})
