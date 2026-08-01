import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({ prisma: { user: { findUnique: vi.fn() } } }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { GET } from './route'

function makeRequest() {
  return new NextRequest('http://localhost/api/user/mfa/status', { headers: { cookie: 'eshop_session=tok' } })
}

beforeEach(() => vi.clearAllMocks())

describe('GET /api/user/mfa/status', () => {
  it('rejects unauthenticated callers', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await GET(makeRequest())
    expect(res.status).toBe(401)
  })

  it('reports enabled state and remaining backup codes', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'admin1', platformRole: 'admin' } as never)
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      mfaEnabled: true,
      mfaEnrolledAt: new Date('2026-08-01T00:00:00.000Z'),
      mfaBackupCodes: ['h1', 'h2', 'h3'],
    } as never)

    const res = await GET(makeRequest())
    const json = await res.json()

    expect(json).toEqual({
      enabled: true,
      enrolledAt: '2026-08-01T00:00:00.000Z',
      backupCodesRemaining: 3,
    })
  })
})
