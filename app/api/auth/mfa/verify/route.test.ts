import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { mfaChallenge: { findUnique: vi.fn(), deleteMany: vi.fn() }, user: { findUnique: vi.fn(), update: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({
  hashToken: vi.fn((t: string) => `hash(${t})`),
  createSession: vi.fn(),
  mapDbToServerUser: vi.fn((u) => u),
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

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  vi.mocked(resetRateLimit).mockResolvedValue(undefined)
  vi.mocked(createSession).mockResolvedValue('new-token')
})

describe('POST /api/auth/mfa/verify', () => {
  it('rejects a missing/expired challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue(null)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
  })

  it('rejects when rate-limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(429)
    expect(prisma.mfaChallenge.findUnique).not.toHaveBeenCalled()
  })

  it('rejects a stale challenge whose user is no longer an MFA-enabled admin', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', platformRole: 'customer', mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [] },
    } as never)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects an expired challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() - 1000),
      user: { id: 'u1', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'ENCRYPTED', mfaBackupCodes: [] },
    } as never)
    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    expect(res.status).toBe(401)
  })

  it('accepts a valid TOTP code, creates a session, and deletes the challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'ENCRYPTED', mfaBackupCodes: [] },
    } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(true)

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.user.id).toBe('u1')
    expect(createSession).toHaveBeenCalledWith('u1')
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
    expect(prisma.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: 'hash(tok)' } })
    expect(resetRateLimit).toHaveBeenCalledWith('mfa:token:hash(tok)')
    expect(resetRateLimit).toHaveBeenCalledWith('mfa:ip:203.0.113.10')
  })

  it('rejects a wrong TOTP code with no valid backup code, leaving the challenge intact for retry', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'ENCRYPTED', mfaBackupCodes: ['bhash1'] },
    } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    vi.mocked(consumeBackupCode).mockResolvedValue({ ok: false, remaining: ['bhash1'] })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: '000000' }))

    expect(res.status).toBe(401)
    expect(prisma.mfaChallenge.deleteMany).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(resetRateLimit).not.toHaveBeenCalled()
  })

  it('accepts a valid backup code, persists the reduced backup-code list, and deletes the challenge', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'ENCRYPTED', mfaBackupCodes: ['bhash1', 'bhash2'] },
    } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    vi.mocked(consumeBackupCode).mockResolvedValue({ ok: true, remaining: ['bhash2'] })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: 'deadbeef01' }))

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u1' }, data: { mfaBackupCodes: ['bhash2'] } })
    expect(prisma.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { tokenHash: 'hash(tok)' } })
    expect(createSession).toHaveBeenCalledWith('u1')
  })

  it('falls through to the backup-code check when decrypting the TOTP secret throws', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'ENCRYPTED', mfaBackupCodes: ['bhash1'] },
    } as never)
    vi.mocked(verifyTotpCode).mockRejectedValue(new Error('bad key'))
    vi.mocked(consumeBackupCode).mockResolvedValue({ ok: true, remaining: [] })

    const res = await POST(makeRequest({ challengeToken: 'tok', code: 'deadbeef01' }))

    expect(res.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith('u1')
  })

  it('resets the rate-limit keys used at the top of the request (hashed token, not the raw one)', async () => {
    vi.mocked(prisma.mfaChallenge.findUnique).mockResolvedValue({
      tokenHash: 'hash(tok)', userId: 'u1', expiresAt: new Date(Date.now() + 60_000),
      user: { id: 'u1', email: 'admin@test.com', platformRole: 'admin', mfaEnabled: true, mfaSecret: 'ENCRYPTED', mfaBackupCodes: [] },
    } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(true)

    await POST(makeRequest({ challengeToken: 'tok', code: '123456' }))

    expect(checkRateLimit).toHaveBeenCalledWith('mfa:token:hash(tok)', { windowMs: 15 * 60 * 1000, maxAttempts: 5 })
  })
})
