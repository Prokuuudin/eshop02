import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: vi.fn(),
    passwordResetToken: { findUnique: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import { POST } from './route'

const FUTURE = new Date(Date.now() + 3600_000)

function makeTx() {
  return {
    passwordResetToken: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    user: { update: vi.fn(async () => ({ id: 'u1' })) },
    session: { deleteMany: vi.fn(async () => ({ count: 2 })) },
  }
}

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
  vi.mocked(prisma.passwordResetToken.findUnique as any).mockResolvedValue({
    tokenHash: 'hashed',
    expiresAt: FUTURE,
    user: { id: 'u1', email: 'user@test.com' },
  })
})

describe('POST /api/auth/reset-password', () => {
  it('writes the new password hash to the DB for the token owner', async () => {
    const tx = makeTx()
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))
    const res = await POST(makeRequest({ token: 'tok', password: 'new-password-1' }))
    expect(res.status).toBe(200)
    const args = (tx.user.update as any).mock.calls[0][0] as any
    expect(args.data.passwordHash).toBe('NEW_HASH')
    expect(args.data.mustChangePassword).toBe(false)
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
  })

  it('rejects a too-short password without consuming the token or touching the user', async () => {
    const res = await POST(makeRequest({ token: 'tok', password: '123' }))
    expect(res.status).toBe(400)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects an invalid token', async () => {
    vi.mocked(prisma.passwordResetToken.findUnique as any).mockResolvedValue(null)
    const res = await POST(makeRequest({ token: 'nope', password: 'new-password-1' }))
    expect(res.status).toBe(404)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })

  it('rejects a token that another request consumed first', async () => {
    const tx = makeTx()
    tx.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 0 })
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const res = await POST(makeRequest({ token: 'tok', password: 'new-password-1' }))

    expect(res.status).toBe(404)
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(tx.session.deleteMany).not.toHaveBeenCalled()
  })
})
