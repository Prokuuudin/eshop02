import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { transactionMock, tokenFindUniqueMock, hashPasswordMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  tokenFindUniqueMock: vi.fn(),
  hashPasswordMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $transaction: transactionMock,
    passwordResetToken: { findUnique: tokenFindUniqueMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock,
}))

import { POST } from './route'

const FUTURE = new Date(Date.now() + 3600_000)

function makeTx() {
  return {
    passwordResetToken: { deleteMany: vi.fn(async () => ({ count: 1 })) },
    user: {
      update: vi.fn(async (_args: {
        data: { passwordHash: string; mustChangePassword: boolean }
      }) => ({ id: 'u1' })),
    },
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
  hashPasswordMock.mockResolvedValue('NEW_HASH')
  tokenFindUniqueMock.mockResolvedValue({
    tokenHash: 'hashed',
    expiresAt: FUTURE,
    user: { id: 'u1', email: 'user@test.com' },
  })
})

describe('POST /api/auth/reset-password', () => {
  it('writes the new password hash to the DB for the token owner', async () => {
    const tx = makeTx()
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const res = await POST(makeRequest({ token: 'tok', password: 'new-password-1' }))
    expect(res.status).toBe(200)
    const args = tx.user.update.mock.calls[0][0]
    expect(args.data.passwordHash).toBe('NEW_HASH')
    expect(args.data.mustChangePassword).toBe(false)
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
  })

  it('rejects a too-short password without consuming the token or touching the user', async () => {
    const res = await POST(makeRequest({ token: 'tok', password: '123' }))
    expect(res.status).toBe(400)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid token', async () => {
    tokenFindUniqueMock.mockResolvedValue(null)
    const res = await POST(makeRequest({ token: 'nope', password: 'new-password-1' }))
    expect(res.status).toBe(404)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('rejects a token that another request consumed first', async () => {
    const tx = makeTx()
    tx.passwordResetToken.deleteMany.mockResolvedValueOnce({ count: 0 })
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const res = await POST(makeRequest({ token: 'tok', password: 'new-password-1' }))

    expect(res.status).toBe(404)
    expect(tx.user.update).not.toHaveBeenCalled()
    expect(tx.session.deleteMany).not.toHaveBeenCalled()
  })
})
