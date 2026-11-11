import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), findFirst: vi.fn() }, mfaChallenge: { create: vi.fn(), deleteMany: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({
  verifyPassword: vi.fn(), createSession: vi.fn(), mapDbToServerUser: vi.fn((user) => user),
  hashToken: vi.fn((token: string) => token),
  requiresAdminMfa: (u: { platformRole?: string | null; teamRole?: string | null } | null) => u?.platformRole === 'admin' || u?.teamRole === 'manager',
  sessionCookieMaxAgeSeconds: vi.fn(() => 60),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/auth-session-audit', () => ({ createStaffSessionWithAudit: vi.fn(), recordRejectedStaffLogin: vi.fn(), revokeSessionWithAudit: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(), resetRateLimit: vi.fn(), refundRateLimit: vi.fn(), gcRateLimitStore: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { verifyPassword, createSession } from '@/lib/server-auth'
import { checkRateLimit, refundRateLimit, resetRateLimit } from '@/lib/rate-limit'
import { recordRejectedStaffLogin } from '@/lib/auth-session-audit'
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
    expect(checkRateLimit).toHaveBeenCalledWith('login:ip:203.0.113.10', { windowMs: 15 * 60 * 1000, maxAttempts: 30 })
    expect(checkRateLimit).toHaveBeenCalledWith('login:email:user@test.com')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(verifyPassword).not.toHaveBeenCalled()
  })

  it('restarts the identifier counter but only refunds this attempt on the IP budget', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ id: 'u1', email: 'user@test.com', passwordHash: 'hash', platformRole: 'admin', mfaEnabled: true } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest())

    expect(res.status).toBe(200)
    expect(resetRateLimit).toHaveBeenCalledWith('login:email:user@test.com')
    expect(refundRateLimit).toHaveBeenCalledWith('login:ip:203.0.113.10')
    // Clearing the IP counter would let an attacker erase failures with their own valid account.
    expect(resetRateLimit).not.toHaveBeenCalledWith('login:ip:203.0.113.10')
  })

  it('leaves both counters untouched after a wrong password', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'c1', email: 'c@example.com', cardNumber: '1234', passwordHash: 'hash', platformRole: 'customer', mustChangePassword: false,
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(false)

    const res = await POST(makeRequest('1234'))

    expect(res.status).toBe(401)
    expect(resetRateLimit).not.toHaveBeenCalled()
    expect(refundRateLimit).not.toHaveBeenCalled()
  })

  describe('not-yet-activated customer (mustChangePassword)', () => {
    const dormant = { id: 'c2', email: 'c2@example.com', cardNumber: '716', passwordHash: 'shared-hash', platformRole: 'customer', teamRole: null, mustChangePassword: true }

    it('gets no session or cookie with the correct old password and is sent to activation', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(dormant as never)
      vi.mocked(verifyPassword).mockResolvedValue(true)

      const res = await POST(makeRequest('716'))

      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'activation_required' })
      expect(createSession).not.toHaveBeenCalled()
      expect(res.cookies.get('eshop_session')).toBeUndefined()
    })

    it('does not reset or refund any counter, so the attempt stays counted', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(dormant as never)
      vi.mocked(verifyPassword).mockResolvedValue(true)

      await POST(makeRequest('716'))

      expect(resetRateLimit).not.toHaveBeenCalled()
      expect(refundRateLimit).not.toHaveBeenCalled()
    })

    it('answers a wrong password like any other failure, so the card state is not revealed', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue(dormant as never)
      vi.mocked(verifyPassword).mockResolvedValue(false)

      const res = await POST(makeRequest('716'))

      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'invalid_credentials' })
      expect(createSession).not.toHaveBeenCalled()
    })

    it('keeps staff on the MFA path: forced change happens after the second factor', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'a1', email: 'user@test.com', passwordHash: 'hash', platformRole: 'admin', mfaEnabled: true, mustChangePassword: true,
      } as never)
      vi.mocked(verifyPassword).mockResolvedValue(true)

      const res = await POST(makeRequest())
      const json = await res.json()

      expect(res.status).toBe(200)
      expect(json.mfaRequired).toBe(true)
      expect(createSession).not.toHaveBeenCalled()
    })
  })

  it('gives a customer (card login) a normal session with no MFA step', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'c1', email: 'c@example.com', cardNumber: '1234', passwordHash: 'hash', platformRole: 'customer', teamRole: 'admin',
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest('1234'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.mfaRequired).toBeUndefined()
    expect(createSession).toHaveBeenCalledWith('c1')
    expect(res.cookies.get('eshop_session')?.value).toBe('token')
    expect(prisma.mfaChallenge.create).not.toHaveBeenCalled()
  })

  it('forces enrollment for an admin without MFA: challenge only, no session, no cookie', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'admin2', email: 'user@test.com', passwordHash: 'hash', platformRole: 'admin', mfaEnabled: false,
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest())
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ mfaRequired: true, enrollmentRequired: true, challengeToken: expect.any(String) })
    expect(createSession).not.toHaveBeenCalled()
    expect(res.cookies.get('eshop_session')).toBeUndefined()
    const created = vi.mocked(prisma.mfaChallenge.create).mock.calls[0][0] as { data: { expiresAt: Date } }
    // Longer window than a plain TOTP step, to install the app and scan the QR code.
    expect(created.data.expiresAt.getTime() - Date.now()).toBeGreaterThan(10 * 60 * 1000)
  })

  it('also requires MFA for a staff manager logging in by card number', async () => {
    vi.mocked(prisma.user.findFirst).mockResolvedValue({
      id: 'm1', email: 'm@example.com', cardNumber: '777', passwordHash: 'hash', platformRole: 'customer', teamRole: 'manager', mfaEnabled: false,
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest('777'))
    const json = await res.json()

    expect(json.mfaRequired).toBe(true)
    expect(json.enrollmentRequired).toBe(true)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('lets a staff manager log in by email, but only through the MFA step', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'm2', email: 'manager@test.com', passwordHash: 'hash', platformRole: 'customer', teamRole: 'manager', mfaEnabled: true,
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest('manager@test.com'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(verifyPassword).toHaveBeenCalledWith('Password123!', 'hash')
    expect(json.mfaRequired).toBe(true)
    expect(json.enrollmentRequired).toBe(false)
    expect(createSession).not.toHaveBeenCalled()
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('rejects a B2B company owner (teamRole admin) logging in by email', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: 'owner1', email: 'owner@test.com', passwordHash: 'hash', platformRole: 'customer', teamRole: 'admin',
    } as never)
    vi.mocked(verifyPassword).mockResolvedValue(true)

    const res = await POST(makeRequest('owner@test.com'))

    expect(res.status).toBe(401)
    expect(verifyPassword).toHaveBeenCalledWith('Password123!', expect.not.stringMatching(/^hash$/))
    expect(createSession).not.toHaveBeenCalled()
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
    expect(json.enrollmentRequired).toBe(false)
    expect(typeof json.challengeToken).toBe('string')
    expect(json.user).toBeUndefined()
    expect(createSession).not.toHaveBeenCalled()
    expect(res.cookies.get('eshop_session')).toBeUndefined()
    expect(prisma.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { userId: 'admin1' } })
    expect(prisma.mfaChallenge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: 'admin1' }),
    })
  })

  describe('staff session audit', () => {
    it('audits a wrong password for a recognised staff account without changing the response', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'admin1', email: 'user@test.com', passwordHash: 'hash', platformRole: 'admin', mfaEnabled: true,
      } as never)
      vi.mocked(verifyPassword).mockResolvedValue(false)

      const res = await POST(makeRequest())

      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ error: 'invalid_credentials' })
      expect(recordRejectedStaffLogin).toHaveBeenCalledWith(expect.any(NextRequest), expect.objectContaining({ id: 'admin1' }), 'invalid_password')
    })

    it('never audits customer logins, unknown identifiers or the password step of a staff login', async () => {
      vi.mocked(prisma.user.findFirst).mockResolvedValue({
        id: 'c1', email: 'c@example.com', cardNumber: '1234', passwordHash: 'hash', platformRole: 'customer', teamRole: 'admin',
      } as never)
      vi.mocked(verifyPassword).mockResolvedValue(false)
      expect((await POST(makeRequest('1234'))).status).toBe(401)

      vi.mocked(prisma.user.findUnique).mockResolvedValue(null)
      expect((await POST(makeRequest('ghost@test.com'))).status).toBe(401)

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: 'admin1', email: 'user@test.com', passwordHash: 'hash', platformRole: 'admin', mfaEnabled: true,
      } as never)
      vi.mocked(verifyPassword).mockResolvedValue(true)
      expect((await POST(makeRequest())).status).toBe(200)

      expect(recordRejectedStaffLogin).not.toHaveBeenCalled()
    })
  })
})
