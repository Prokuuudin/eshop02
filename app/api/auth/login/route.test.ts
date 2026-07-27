import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({
  verifyPassword: vi.fn(), createSession: vi.fn(), mapDbToServerUser: vi.fn((user) => user),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(), resetRateLimit: vi.fn(), gcRateLimitStore: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { verifyPassword, createSession } from '@/lib/server-auth'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function makeRequest(email = ' User@Test.COM ') {
  return new NextRequest('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify({ email, password: 'Password123!' }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
  vi.mocked(createSession).mockResolvedValue('token')
})

describe('POST /api/auth/login', () => {
  it('applies independent IP and normalized-email limits before bcrypt', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })

    const res = await POST(makeRequest())

    expect(res.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('login:ip:203.0.113.10')
    expect(checkRateLimit).toHaveBeenCalledWith('login:email:user@test.com')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(verifyPassword).not.toHaveBeenCalled()
  })

  it('resets both counters after successful authentication', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', email: 'user@test.com', passwordHash: 'hash' } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(resetRateLimit).toHaveBeenCalledWith('login:ip:203.0.113.10')
    expect(resetRateLimit).toHaveBeenCalledWith('login:email:user@test.com')
    expect(createSession).toHaveBeenCalledWith('u1')
  })

  it('finds a real-email account directly by normalized cardNumber', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'u-card',
      email: 'anna@example.com',
      cardNumber: '1234',
      passwordHash: 'hash',
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest(' 12 34 '))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { cardNumber: { equals: '1234', mode: 'insensitive' } },
    })
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(checkRateLimit).toHaveBeenCalledWith('login:card:1234')
    expect(json.user.email).toBe('anna@example.com')
  })
})
