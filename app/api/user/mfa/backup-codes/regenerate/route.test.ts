import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn(), update: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/mfa', () => ({
  decryptSecret: vi.fn(() => 'RAWSECRET'),
  verifyTotpCode: vi.fn(),
  generateBackupCodes: vi.fn(() => ['n1', 'n2']),
  hashBackupCodes: vi.fn(async (codes: string[]) => codes.map((c) => `hash(${c})`)),
}))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { verifyTotpCode } from '@/lib/mfa'
import { POST } from './route'

function makeRequest(code: string) {
  return new NextRequest('http://localhost/api/user/mfa/backup-codes/regenerate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost', cookie: 'eshop_session=tok' },
    body: JSON.stringify({ code }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', platformRole: 'admin' } as never)
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ mfaSecret: 'ENCRYPTED', mfaEnabled: true } as never)
})

describe('POST /api/user/mfa/backup-codes/regenerate', () => {
  it('rejects a wrong code', async () => {
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    const res = await POST(makeRequest('000000'))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('replaces backup codes on a correct code', async () => {
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    const res = await POST(makeRequest('123456'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json.backupCodes).toEqual(['n1', 'n2'])
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'admin1' },
      data: { mfaBackupCodes: ['hash(n1)', 'hash(n2)'] },
    })
  })
})
