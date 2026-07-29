import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  userFindUniqueMock,
  userUpdateMock,
  verifyPasswordMock,
  createSessionMock,
  checkRateLimitMock,
  resetRateLimitMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  userUpdateMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  createSessionMock: vi.fn(),
  checkRateLimitMock: vi.fn(),
  resetRateLimitMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock, update: userUpdateMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  verifyPassword: verifyPasswordMock,
  createSession: createSessionMock,
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: checkRateLimitMock,
  resetRateLimit: resetRateLimitMock,
  gcRateLimitStore: vi.fn(),
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/sync', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const SYNC_BODY = { id: 'seed_user_001', email: 'user@test.com', password: 'user123' }

beforeEach(() => {
  vi.clearAllMocks()
  checkRateLimitMock.mockResolvedValue({ limited: false, resetAt: 0 })
  createSessionMock.mockResolvedValue('token')
})

describe('POST /api/auth/sync — login only, no self-registration', () => {
  it('rejects when no account exists for the email (never creates one)', async () => {
    userFindUniqueMock.mockResolvedValue(null)

    const res = await POST(makeRequest(SYNC_BODY))

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid_credentials')
    expect(userUpdateMock).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('rejects a wrong password for an existing account', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      passwordHash: 'hash',
    })
    verifyPasswordMock.mockResolvedValue(false)

    const res = await POST(makeRequest(SYNC_BODY))

    expect(res.status).toBe(401)
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it('applies independent IP and normalized-email limits before bcrypt', async () => {
    checkRateLimitMock
      .mockResolvedValueOnce({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })

    const res = await POST(makeRequest({ ...SYNC_BODY, email: ' User@Test.COM ' }))

    expect(res.status).toBe(429)
    expect(checkRateLimitMock).toHaveBeenCalledWith('sync:ip:unknown')
    expect(checkRateLimitMock).toHaveBeenCalledWith('sync:email:user@test.com')
    expect(userFindUniqueMock).not.toHaveBeenCalled()
    expect(verifyPasswordMock).not.toHaveBeenCalled()
  })

  it('logs in and updates safe fields for a verified existing account', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      passwordHash: 'hash',
    })
    verifyPasswordMock.mockResolvedValue(true)
    userUpdateMock.mockResolvedValue({})

    const res = await POST(makeRequest({ ...SYNC_BODY, name: 'New Name' }))

    expect(res.status).toBe(200)
    expect(createSessionMock).toHaveBeenCalledWith('u1')
    const updateArgs = userUpdateMock.mock.calls[0][0] as {
      where: { id: string }
      data: Record<string, unknown>
    }
    expect(updateArgs.where.id).toBe('u1')
    expect(updateArgs.data.name).toBe('New Name')
    expect(resetRateLimitMock).toHaveBeenCalledWith('sync:ip:unknown')
    expect(resetRateLimitMock).toHaveBeenCalledWith('sync:email:user@test.com')
  })

  it('never assigns or clears cardNumber from the client payload', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      passwordHash: 'hash',
      cardNumber: 'OWN-CARD',
    })
    verifyPasswordMock.mockResolvedValue(true)
    userUpdateMock.mockResolvedValue({})

    const res = await POST(makeRequest({
      ...SYNC_BODY,
      cardNumber: 'VICTIM-CARD',
      name: 'Safe Name',
    }))

    expect(res.status).toBe(200)
    const updateArgs = userUpdateMock.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
    expect(updateArgs.data).not.toHaveProperty('cardNumber')
    expect(updateArgs.data.name).toBe('Safe Name')
  })
})
