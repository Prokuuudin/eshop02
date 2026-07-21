import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  resetRateLimit: vi.fn(),
  gcRateLimitStore: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { verifyPassword, createSession } from '@/lib/server-auth'
import { checkRateLimit, resetRateLimit } from '@/lib/rate-limit'
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
  vi.mocked(checkRateLimit as any).mockResolvedValue({ limited: false, resetAt: 0 })
  vi.mocked(createSession as any).mockResolvedValue('token')
})

describe('POST /api/auth/sync — login only, no self-registration', () => {
  it('rejects when no account exists for the email (never creates one)', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue(null)

    const res = await POST(makeRequest(SYNC_BODY))

    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid_credentials')
    expect(prisma.user.update).not.toHaveBeenCalled()
    expect(createSession).not.toHaveBeenCalled()
  })

  it('rejects a wrong password for an existing account', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      passwordHash: 'hash',
    })
    vi.mocked(verifyPassword as any).mockResolvedValue(false)

    const res = await POST(makeRequest(SYNC_BODY))

    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('applies independent IP and normalized-email limits before bcrypt', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })

    const res = await POST(makeRequest({ ...SYNC_BODY, email: ' User@Test.COM ' }))

    expect(res.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('sync:ip:unknown')
    expect(checkRateLimit).toHaveBeenCalledWith('sync:email:user@test.com')
    expect(prisma.user.findUnique).not.toHaveBeenCalled()
    expect(verifyPassword).not.toHaveBeenCalled()
  })

  it('logs in and updates safe fields for a verified existing account', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      passwordHash: 'hash',
    })
    vi.mocked(verifyPassword as any).mockResolvedValue(true)
    vi.mocked(prisma.user.update as any).mockResolvedValue({})

    const res = await POST(makeRequest({ ...SYNC_BODY, name: 'New Name' }))

    expect(res.status).toBe(200)
    expect(createSession).toHaveBeenCalledWith('u1')
    const updateArgs = vi.mocked(prisma.user.update).mock.calls[0][0] as any
    expect(updateArgs.where.id).toBe('u1')
    expect(updateArgs.data.name).toBe('New Name')
    expect(resetRateLimit).toHaveBeenCalledWith('sync:ip:unknown')
    expect(resetRateLimit).toHaveBeenCalledWith('sync:email:user@test.com')
  })

  it('never assigns or clears cardNumber from the client payload', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1',
      email: 'user@test.com',
      passwordHash: 'hash',
      cardNumber: 'OWN-CARD',
    })
    vi.mocked(verifyPassword as any).mockResolvedValue(true)
    vi.mocked(prisma.user.update as any).mockResolvedValue({})

    const res = await POST(makeRequest({
      ...SYNC_BODY,
      cardNumber: 'VICTIM-CARD',
      name: 'Safe Name',
    }))

    expect(res.status).toBe(200)
    const updateArgs = vi.mocked(prisma.user.update).mock.calls[0][0] as any
    expect(updateArgs.data).not.toHaveProperty('cardNumber')
    expect(updateArgs.data.name).toBe('Safe Name')
  })
})
