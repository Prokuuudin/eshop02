import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { user: { findUnique: vi.fn(), update: vi.fn() }, session: { deleteMany: vi.fn() } },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  consumeBackupCode: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { getServerUser, verifyPassword, createSession } from '@/lib/server-auth'
import { verifyTotpCode, consumeBackupCode } from '@/lib/mfa'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/user/mfa/disable', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: 'eshop_session=tok' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', platformRole: 'admin' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({
    passwordHash: 'HASH', mfaSecret: 'ENCRYPTED', mfaBackupCodes: [],
  } as never)
  vi.mocked(createSession).mockResolvedValue('new-token')
  vi.mocked(consumeBackupCode).mockResolvedValue({ ok: false, remaining: [] })
})

describe('POST /api/user/mfa/disable', () => {
  it('rejects a wrong password even with a valid code', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(false)
    const res = await POST(makeRequest({ currentPassword: 'wrong', code: '123456' }))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('rejects a wrong code even with the right password', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true)
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    const res = await POST(makeRequest({ currentPassword: 'right', code: '000000' }))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('disables MFA and rotates sessions on success', async () => {
    vi.mocked(verifyPassword).mockResolvedValue(true)
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest({ currentPassword: 'right', code: '123456' }))

    expect(res.status).toBe(200)
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin1' },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaEnrolledAt: null },
    })
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'admin1' } })
    expect(createSession).toHaveBeenCalledWith('admin1')
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
  })
})
