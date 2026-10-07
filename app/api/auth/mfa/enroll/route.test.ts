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
  requiresAdminMfa: (u: { platformRole?: string | null; teamRole?: string | null } | null) => u?.platformRole === 'admin' || u?.teamRole === 'manager',
  sessionCookieMaxAgeSeconds: vi.fn(() => 86_400),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/mfa', () => ({
  generateTotpSecret: vi.fn(() => 'RAWSECRET'),
  buildOtpauthUri: vi.fn(() => 'otpauth://totp/x'),
  encryptSecret: vi.fn(() => 'iv.tag.ct'),
}))
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn(async () => 'data:image/png;base64,QR') } }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), resetRateLimit: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { encryptSecret } from '@/lib/mfa'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/mfa/enroll', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.10' },
    body: JSON.stringify(body),
  })
}

function challenge(user: Record<string, unknown> = {}) {
  return {
    tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
    user: { id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], ...user },
  } as never
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  vi.mocked(prisma.user.updateMany).mockResolvedValue({ count: 1 })
})

describe('POST /api/auth/mfa/enroll', () => {
  it('starts enrollment for an admin without MFA: stores only the encrypted secret, returns the QR', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())

    const res = await POST(makeRequest({ challengeToken: 'tok' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.qrCodeDataUrl).toBe('data:image/png;base64,QR')
    expect(prisma.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', mfaEnabled: false },
      data: { mfaSecret: 'iv.tag.ct' },
    })
    // Enrollment alone never enables MFA or creates a session.
    expect(JSON.stringify(vi.mocked(prisma.user.updateMany).mock.calls)).not.toContain('mfaEnabled":true')
    expect(res.cookies.get('eshop_session')).toBeUndefined()
  })

  it('refuses to re-bind an account that already has MFA (no device takeover via password alone)', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ mfaEnabled: true, mfaSecret: 'old' }))
    const res = await POST(makeRequest({ challengeToken: 'tok' }))
    expect(res.status).toBe(401)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('rejects unknown tokens and customers', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(null)
    expect((await POST(makeRequest({ challengeToken: 'tok' }))).status).toBe(401)
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge({ platformRole: 'customer' }))
    expect((await POST(makeRequest({ challengeToken: 'tok' }))).status).toBe(401)
    expect((await POST(makeRequest({}))).status).toBe(401)
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('fails closed (503) without storing anything when MFA_ENCRYPTION_KEY is missing/invalid', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(challenge())
    vi.mocked(encryptSecret).mockImplementationOnce(() => { throw new Error('MFA_ENCRYPTION_KEY is not configured') })

    const res = await POST(makeRequest({ challengeToken: 'tok' }))

    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('mfa_not_configured')
    expect(prisma.user.updateMany).not.toHaveBeenCalled()
  })

  it('is rate limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest({ challengeToken: 'tok' }))
    expect(res.status).toBe(429)
    expect(prisma.mfaChallenge.findUnique).not.toHaveBeenCalled()
  })
})
