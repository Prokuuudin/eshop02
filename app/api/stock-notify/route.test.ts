import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { stockNotification: { upsert: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), gcRateLimitStore: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const request = (body: Record<string, unknown>) => new NextRequest('http://localhost/api/stock-notify', {
  method: 'POST', body: JSON.stringify(body), headers: { 'x-forwarded-for': '203.0.113.7' },
})

describe('POST /api/stock-notify abuse controls', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  })

  it('limits by both IP and normalized email before upsert', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const response = await POST(request({ productId: 'p1', email: ' User@Example.com ' }))
    expect(response.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('stock-notify:ip:203.0.113.7', expect.any(Object))
    expect(checkRateLimit).toHaveBeenCalledWith('stock-notify:email:user@example.com', expect.any(Object))
    expect(prisma.stockNotification.upsert).not.toHaveBeenCalled()
  })

  it('rejects oversized product titles before upsert', async () => {
    const response = await POST(request({ productId: 'p1', productTitle: 'x'.repeat(201), email: 'u@example.com' }))
    expect(response.status).toBe(400)
    expect(prisma.stockNotification.upsert).not.toHaveBeenCalled()
  })
})
