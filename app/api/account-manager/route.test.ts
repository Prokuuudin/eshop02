import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { accountManagerMessage: { create: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), gcRateLimitStore: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const request = (text: string) => new NextRequest('http://localhost/api/account-manager', {
  method: 'POST',
  body: JSON.stringify({ companyId: 'c1', text }),
})

describe('POST /api/account-manager abuse controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', companyId: 'c1', platformRole: 'customer' } as never)
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 19, resetAt: Date.now() + 60_000 })
  })

  it('rate-limits per company and authenticated user before creating a message', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const response = await POST(request('hello'))
    expect(response.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('account-manager:c1:u1', expect.any(Object))
    expect(prisma.accountManagerMessage.create).not.toHaveBeenCalled()
  })

  it('rejects oversized messages before writing them', async () => {
    const response = await POST(request('x'.repeat(5001)))
    expect(response.status).toBe(400)
    expect(prisma.accountManagerMessage.create).not.toHaveBeenCalled()
  })
})
