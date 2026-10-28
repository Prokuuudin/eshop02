import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    mfaChallenge: { findUnique: vi.fn(), deleteMany: vi.fn() },
    user: { updateMany: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashToken: vi.fn((t: string) => `hash(${t})`),
  createSession: vi.fn(),
  mapDbToServerUser: vi.fn(({ id, email, platformRole, mfaEnabled }) => ({ id, email, platformRole, mfaEnabled })),
  requiresAdminMfa: (u: { platformRole?: string | null; teamRole?: string | null } | null) => u?.platformRole === 'admin' || u?.teamRole === 'manager',
  sessionCookieMaxAgeSeconds: vi.fn(() => 86_400),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  generateBackupCodes: vi.fn(() => ['aaaa111111', 'bbbb222222']),
  hashBackupCodes: vi.fn(async (codes: string[]) => codes.map((c) => `bcrypt(${c})`)),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), resetRateLimit: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/server-auth'
import { decryptSecret, verifyTotpCode } from '@/lib/mfa'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/mfa/enroll/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  })
}

function challenge(user: Record<string, unknown> = {}) {
  return {
    tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: false, mfaSecret: 'iv.tag.ct', mfaBackupCodes: [], ...user },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  vi.mocked(createSession).mockResolvedValue('new-token')
  vi.mocked(prisma.mfaChallenge.deleteMany).mockResolvedValue({ count: 1 })
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 })
})

describe('POST /api/auth/mfa/enroll/confirm', () => {
  it('a wrong first code does not activate MFA and creates no session', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(verifyTotpCode).mockResolvedValue(false)

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '000000' }))

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid_code')
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
    expect(prisma.mfaChallenge.deleteMany).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('the correct first code activates MFA, stores only hashed recovery codes and creates an MFA-verified session', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(verifyTotpCode).mockResolvedValue(true)

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(verifyTotpCode).toHaveBeenCalledWith('RAWSECRET', '123456')
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', mfaEnabled: false, mfaSecret: 'iv.tag.ct' },
      data: expect.objectContaining({
        mfaEnabled: true,
        mfaBackupCodes: ['bcrypt(aaaa111111)', 'bcrypt(bbbb222222)'],
        mfaEnrolledAt: expect.any(Date),
      }),
    })
    // Plaintext codes are shown once to the user, never persisted.
    expect(json.backupCodes).toEqual(['aaaa111111', 'bbbb222222'])
    expect(JSON.stringify(json)).not.toContain('iv.tag.ct')
    expect(JSON.stringify(json)).not.toContain('RAWSECRET')
    expect(json.user.mfaEnabled).toBe(true)
    expect(prisma.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: 'hash(tok)' } })
    expect(createSession).toHaveBeenCalledWith('u1', { mfaVerified: true })
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
    expect(resetRateLimit).toHaveBeenCalledWith('mfa:user:u1')
  })

  it('rejects when no enrollment was started (no pending secret)', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ mfaSecret: null }))
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
    expect(verifyTotpCode).not.toHaveBeenCalled()
  })

  it('cannot be used for an account that already has MFA', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ mfaEnabled: true }))
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('a double submit yields one winner; the loser neither enables MFA nor gets a session', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    vi.mocked(prisma.mfaChallenge.deleteMany).mockResolvedValue({ count: 0 })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))

    expect(res.status).toBe(401)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('fails closed (503) when the stored secret cannot be decrypted', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(decryptSecret).mockImplementationOnce(() => { throw new Error('Unsupported state or unable to authenticate data') })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))

    expect(res.status).toBe(503)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('applies the per-account attempt limit', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(checkRateLimit).mockImplementation(async (key: string) => ({
      limited: key === 'mfa:user:u1', remaining: 0, resetAt: Date.now() + 60_000,
    }))
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(429)
    expect(verifyTotpCode).not.toHaveBeenCalled()
  })
})
