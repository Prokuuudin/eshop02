import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  generateBackupCodes: vi.fn(() => ['a1', 'a2']),
  hashBackupCodes: vi.fn(async (codes: string[]) => codes.map((c) => `hash(${c})`)),
}))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { verifyTotpCode } from '@/lib/mfa'
import { POST } from './route'

function makeRequest(code: string) {
  return new NextRequest('http://localhost/api/user/mfa/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: 'eshop_session=tok' },
    body: JSON.stringify({ code }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', platformRole: 'admin' } as never)
})

describe('POST /api/user/mfa/confirm', () => {
  it('rejects when there is no pending secret', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: null, mfaEnabled: false } as never)
    const res = await POST(makeRequest('123456'))
    expect(res.status).toBe(400)
  })

  it('rejects re-enrollment when MFA is already enabled, without touching the live secret', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: 'ENCRYPTED', mfaEnabled: true } as never)
    const res = await POST(makeRequest('123456'))
    const json = await res.json()

    expect(res.status).toBe(400)
    expect(json.error).toBe('mfa_already_enabled')
    expect(verifyTotpCode).not.toHaveBeenCalled()
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('rejects a wrong code without enabling MFA', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: 'ENCRYPTED', mfaEnabled: false } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    const res = await POST(makeRequest('000000'))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('enables MFA and returns backup codes on a correct code', async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: 'ENCRYPTED', mfaEnabled: false } as never)
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest('123456'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.backupCodes).toEqual(['a1', 'a2'])
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin1' },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: ['hash(a1)', 'hash(a2)'],
        mfaEnrolledAt: expect.any(Date),
      },
    })
  })
})
