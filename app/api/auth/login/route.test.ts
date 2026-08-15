import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn() }, mfaChallenge: { create: vi.fn(), deleteMany: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({
  verifyPassword: vi.fn(), createSession: vi.fn(), mapDbToServerUser: vi.fn((user) => user),
  hashToken: vi.fn((token: string) => token),
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
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', email: 'user@test.com', passwordHash: 'hash', platformRole: 'admin' } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(resetRateLimit).toHaveBeenCalledWith('login:ip:203.0.113.10')
    expect(resetRateLimit).toHaveBeenCalledWith('login:email:user@test.com')
    expect(createSession).toHaveBeenCalledWith('u1')
  })

  it('rejects customer login by email, but still runs a dummy bcrypt compare (timing-safe) instead of short-circuiting', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'customer1', email: 'user@test.com', passwordHash: 'hash', platformRole: 'customer',
    } as never)

    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    // Must still pay the bcrypt cost so an "ineligible account" response takes the
    // same time as a "wrong password" one - an attacker can't enumerate valid
    // card numbers/emails from response timing. Compared against the dummy hash,
    // never the account's real one.
    expect(verifyPassword).toHaveBeenCalledWith('Password123!', expect.not.stringMatching(/^hash$/))
    expect(createSession).not.toHaveBeenCalled()
  })

  it('when no account matches at all, still runs bcrypt against the same dummy hash used for an ineligible account', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null)

    const res = await POST(makeRequest())

    expect(res.status).toBe(401)
    expect(verifyPassword).toHaveBeenCalledTimes(1)
    const dummyHashUsedForMissingAccount = vi.mocked(verifyPassword).mock.calls[0][1]

    vi.clearAllMocks()
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'customer1', email: 'user@test.com', passwordHash: 'real-hash', platformRole: 'customer',
    } as never)
    await POST(makeRequest())
    const dummyHashUsedForIneligibleAccount = vi.mocked(verifyPassword).mock.calls[0][1]

    // Same fixed dummy hash on both paths - the two 401 cases must be indistinguishable by timing.
    expect(dummyHashUsedForMissingAccount).toBe(dummyHashUsedForIneligibleAccount)
    expect(dummyHashUsedForIneligibleAccount).not.toBe('real-hash')
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

  it('accepts a zero-padded form of a short card number', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'u-card-1', email: 'short@example.com', cardNumber: '1', passwordHash: 'hash',
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest('0001'))

    expect(res.status).toBe(200)
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { cardNumber: { equals: '1', mode: 'insensitive' } },
    })
    expect(checkRateLimit).toHaveBeenCalledWith('login:card:1')
  })

  it('creates an MFA challenge instead of a session for an MFA-enabled admin, without setting a cookie', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin1', email: 'user@test.com', passwordHash: 'hash', platformRole: 'admin', mfaEnabled: true,
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.mfaRequired).toBe(true)
    expect(typeof json.challengeToken).toBe('string')
    expect(json.user).toBeUndefined()
    expect(createSession).not.toHaveBeenCalled()
    expect(res.cookies.get('eshop_session')).toBeUndefined()
    expect(prisma.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { userId: 'admin1' } })
    expect(prisma.mfaChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'admin1' }),
    })
  })
})
