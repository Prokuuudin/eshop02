import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { invitationFindMock, userFindMock, rateLimitMock, transactionMock, hashPasswordMock, createSessionMock } = vi.hoisted(() => ({
  invitationFindMock: vi.fn(),
  userFindMock: vi.fn(),
  rateLimitMock: vi.fn(),
  transactionMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  createSessionMock: vi.fn(),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    invitationToken: { findUnique: invitationFindMock },
    user: { findUnique: userFindMock },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock, createSession: createSessionMock, SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }))

import { GET, POST } from './route'

const future = new Date(Date.now() + 60_000)
const post = (body: unknown) => POST(new NextRequest('https://shop.test/api/auth/invite', {
  method: 'POST', body: JSON.stringify(body), headers: { 'cf-connecting-ip': '203.0.113.1' },
}))

describe('/api/auth/invite validation and abuse protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitMock.mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
    hashPasswordMock.mockResolvedValue('new-hash')
    createSessionMock.mockResolvedValue('session-token')
  })

  it('rejects a missing token without querying storage', async () => {
    const response = await GET(new NextRequest('https://shop.test/api/auth/invite'))
    expect(response.status).toBe(400)
    expect(invitationFindMock).not.toHaveBeenCalled()
  })

  it('does not reveal details for an invalid token', async () => {
    invitationFindMock.mockResolvedValue(null)
    const response = await GET(new NextRequest('https://shop.test/api/auth/invite?token=bad'))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ ok: false, error: 'invalid_token' })
  })

  it('rate-limits before validating password or invitation state', async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(429)
    expect(invitationFindMock).not.toHaveBeenCalled()
  })

  it('rejects an already consumed invitation', async () => {
    invitationFindMock.mockResolvedValue({ status: 'accepted', expiresAt: future })
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(409)
    expect(userFindMock).not.toHaveBeenCalled()
  })

  it('atomically consumes an invitation and establishes a new session', async () => {
    const invitation = { status: 'sent', expiresAt: future, userId: 'u1', email: 'buyer@test.com', cardNumber: '1234567890' }
    invitationFindMock.mockResolvedValue(invitation)
    userFindMock.mockResolvedValue({ id: 'u1', name: 'Buyer', companyId: 'company-a' })
    const tx = {
      invitationToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { update: vi.fn() }, session: { deleteMany: vi.fn() },
    }
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(200)
    expect(tx.invitationToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'sent' }) }))
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ passwordHash: 'new-hash' }) }))
    expect(response.cookies.get('eshop_session')?.value).toBe('session-token')
  })

  it('maps a concurrent consume loss to already_used and creates no session', async () => {
    invitationFindMock.mockResolvedValue({ status: 'sent', expiresAt: future, userId: 'u1', email: 'buyer@test.com', cardNumber: '1234567890' })
    userFindMock.mockResolvedValue({ id: 'u1', name: 'Buyer', companyId: 'company-a' })
    transactionMock.mockImplementation(async (fn) => fn({
      invitationToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }))
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(409)
    expect(createSessionMock).not.toHaveBeenCalled()
  })
})
