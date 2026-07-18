import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    keyValueSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: vi.fn(),
}))
vi.mock('@/generated/prisma/client', () => ({ Prisma: {} }))

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import { POST } from './route'

const FUTURE = new Date(Date.now() + 3600_000).toISOString()

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/reset-password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(hashPassword as any).mockResolvedValue('NEW_HASH')
  vi.mocked(prisma.keyValueSetting.findUnique as any).mockResolvedValue({
    key: 'password-resets',
    value: { resets: [{ token: 'tok', email: 'user@test.com', expiresAt: FUTURE }] },
  })
  vi.mocked(prisma.keyValueSetting.upsert as any).mockResolvedValue({})
  vi.mocked(prisma.user.findUnique as any).mockResolvedValue({ id: 'u1', email: 'user@test.com' })
  vi.mocked(prisma.user.update as any).mockResolvedValue({ id: 'u1' })
})

describe('POST /api/auth/reset-password', () => {
  it('writes the new password hash to the DB for the token owner', async () => {
    const res = await POST(makeRequest({ token: 'tok', password: 'newpass1' }))
    expect(res.status).toBe(200)
    const args = vi.mocked(prisma.user.update).mock.calls[0][0] as any
    expect(args.data.passwordHash).toBe('NEW_HASH')
    expect(args.data.mustChangePassword).toBe(false)
  })

  it('rejects a too-short password without consuming the token or touching the user', async () => {
    const res = await POST(makeRequest({ token: 'tok', password: '123' }))
    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(prisma.keyValueSetting.upsert).not.toHaveBeenCalled()
  })

  it('rejects an invalid token', async () => {
    const res = await POST(makeRequest({ token: 'nope', password: 'newpass1' }))
    expect(res.status).toBe(404)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})
