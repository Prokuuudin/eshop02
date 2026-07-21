import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { $queryRawUnsafe: vi.fn() } }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { GET } from './route'

function makeRequest(params: string) {
  return new NextRequest(`http://localhost/api/search?${params}`, {
    headers: { 'x-forwarded-for': '203.0.113.20' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 29, resetAt: Date.now() + 60_000 })
  vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([])
})

describe('GET /api/search', () => {
  it('rejects an oversized query without DB work', async () => {
    const res = await GET(makeRequest(`q=${'x'.repeat(161)}`))
    expect(res.status).toBe(400)
    expect(checkRateLimit).not.toHaveBeenCalled()
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('validates take strictly', async () => {
    const res = await GET(makeRequest('q=shampoo&take=999'))
    expect(res.status).toBe(400)
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
  })

  it('rate-limits by IP before the similarity query', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await GET(makeRequest('q=shampoo&take=20'))
    expect(res.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('search:ip:203.0.113.20', expect.any(Object))
    expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled()
  })
})
