import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mfaChallenge: { findUnique: vi.fn(), deleteMany: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashToken: vi.fn((t: string) => `hash(${t})`),
  createSession: vi.fn(),
  mapDbToServerUser: vi.fn(({ id, email, platformRole }) => ({ id, email, platformRole })),
  requiresAdminMfa: (u: { platformRole?: string | null; teamRole?: string | null } | null) => u?.platformRole === 'admin' || u?.teamRole === 'manager',
  sessionCookieMaxAgeSeconds: vi.fn(() => 86_400),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  consumeBackupCode: vi.fn(async () => ({ ok: false, remaining: [] })),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), resetRateLimit: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/server-auth'
import { verifyTotpCode, consumeBackupCode } from '@/lib/mfa'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/mfa/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  })
}

function challenge(user: Record<string, unknown> = {}, expiresInMs = 60_000) {
  return {
    tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + expiresInMs),
    user: {
      id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: true,
      mfaSecret: 'ENCRYPTED', mfaBackupCodes: [], ...user,
    },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  vi.mocked(resetRateLimit).mockResolvedValue(undefined)
  vi.mocked(createSession).mockResolvedValue('new-token')
  vi.mocked(prisma.mfaChallenge.deleteMany).mockResolvedValue({ count: 1 })
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 })
})

describe('POST /api/auth/mfa/verify', () => {
  it('rejects a missing/unknown challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects when the token/IP limit is hit, before any DB lookup', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(429)
    expect(prisma.mfaChallenge.findUnique).not.toHaveBeenCalled()
  })

  it('applies a per-account limit, so fresh tokens and new IPs do not extend the guessing budget', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(checkRateLimit).mockImplementation(async (key: string) => ({
      limited: key === 'mfa:user:u1', remaining: 0, resetAt: Date.now() + 60_000,
    }))
    vi.mocked(verifyTotpCode).mockResolvedValue(true)

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))

    expect(res.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('mfa:user:u1', { windowMs: 24 * 60 * 60 * 1000, maxAttempts: 20 })
    expect(verifyTotpCode).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects a stale challenge whose user no longer has admin access', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ platformRole: 'customer' }))
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects an enrollment challenge (MFA not yet enabled) — that flow must go through /enroll', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ mfaEnabled: false }))
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects an expired challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({}, -1000))
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
  })

  it('accepts a valid TOTP code: MFA-verified session, challenge consumed, no secret in the response', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(verifyTotpCode).mockResolvedValue(true)

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    const text = await res.text()

    expect(res.status).toBe(200)
    expect(JSON.parse(text).user.id).toBe('u1')
    expect(text).not.toContain('ENCRYPTED')
    expect(text).not.toContain('RAWSECRET')
    expect(createSession).toHaveBeenCalledWith('u1', { mfaVerified: true })
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
    expect(prisma.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: 'hash(tok)' } })
    expect(resetRateLimit).toHaveBeenCalledWith('mfa:token:hash(tok)')
    expect(resetRateLimit).toHaveBeenCalledWith('mfa:ip:203.0.113.10')
    expect(resetRateLimit).toHaveBeenCalledWith('mfa:user:u1')
  })

  it('accepts a staff manager with MFA enabled', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ platformRole: 'customer', teamRole: 'manager' }))
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith('u1', { mfaVerified: true })
  })

  it('is single-use: a concurrent second request that loses the challenge gets no session', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    vi.mocked(prisma.mfaChallenge.deleteMany).mockResolvedValue({ count: 0 })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))

    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects a wrong TOTP code with no valid backup code, leaving the challenge intact for retry', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ mfaBackupCodes: ['bhash1'] }))
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    vi.mocked(consumeBackupCode).mockResolvedValue({ ok: false, remaining: ['bhash1'] })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '000000' }))

    expect(res.status).toBe(401)
    expect(prisma.mfaChallenge.deleteMany).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
    expect(resetRateLimit).not.toHaveBeenCalled()
  })

  it('accepts a valid recovery code once, persisting the reduced list with a compare-and-swap', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ mfaBackupCodes: ['bhash1', 'bhash2'] }))
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    vi.mocked(consumeBackupCode).mockResolvedValue({ ok: true, remaining: ['bhash2'] })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: 'deadbeef01' }))

    expect(res.status).toBe(200)
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', mfaBackupCodes: { equals: ['bhash1', 'bhash2'] } },
      data: { mfaBackupCodes: ['bhash2'] },
    })
    expect(createSession).toHaveBeenCalledWith('u1', { mfaVerified: true })
  })

  it('rejects a recovery code that a concurrent request already consumed', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ mfaBackupCodes: ['bhash1'] }))
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    vi.mocked(consumeBackupCode).mockResolvedValue({ ok: true, remaining: [] })
    vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 0 })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: 'deadbeef01' }))

    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('falls through to the recovery-code check when decrypting the TOTP secret throws', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ mfaBackupCodes: ['bhash1'] }))
    vi.mocked(verifyTotpCode).mockRejectedValue(new Error('bad key'))
    vi.mocked(consumeBackupCode).mockResolvedValue({ ok: true, remaining: [] })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: 'deadbeef01' }))

    expect(res.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith('u1', { mfaVerified: true })
  })

  it('counts attempts per hashed token, never the raw one', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(verifyTotpCode).mockResolvedValue(true)

    await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))

    expect(checkRateLimit).toHaveBeenCalledWith('mfa:token:hash(tok)', { windowMs: 15 * 60 * 1000, maxAttempts: 5 })
    expect(checkRateLimit).not.toHaveBeenCalledWith('mfa:token:tok', expect.anything())
  })
})
