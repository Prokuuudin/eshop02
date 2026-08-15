import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { companyMember: { upsert: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { POST } from './route'

const context = { params: Promise.resolve({ id: 'company-a' }) }
const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/companies/company-a/members', {
  method: 'POST', body: JSON.stringify(body),
}), context)

describe('POST /api/companies/:id/members', () => {
  beforeEach(() => vi.clearAllMocks())

  it('blocks a non-admin before any tenant mutation', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'user-a', platformRole: 'customer' } as never)
    const response = await post({ userId: 'user-b', email: 'b@example.com', name: 'B' })
    expect(response.status).toBe(403)
    expect(prisma.companyMember.upsert).not.toHaveBeenCalled()
  })

  it('rejects an unsupported role and ignores a forged addedBy', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'admin-a', platformRole: 'admin' } as never)
    const response = await post({ userId: 'user-b', email: 'b@example.com', name: 'B', role: 'owner', addedBy: 'forged' })
    expect(response.status).toBe(400)
    expect(prisma.companyMember.upsert).not.toHaveBeenCalled()
  })

  it('records the authenticated admin as addedBy', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'admin-a', platformRole: 'admin' } as never)
    vi.mocked(prisma.companyMember.upsert).mockResolvedValue({} as never)
    const response = await post({ userId: 'user-b', email: 'b@example.com', name: 'B', role: 'buyer', addedBy: 'forged' })
    expect(response.status).toBe(200)
    expect(prisma.companyMember.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ role: 'buyer', addedBy: 'admin-a' }),
    }))
  })
})
