import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  gcRateLimitStore: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { hashPassword, verifyPassword, createSession } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/sync', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const SYNC_BODY = { id: 'seed_user_001', email: 'user@test.com', password: 'user123' }

/** findUnique dispatcher: route looks up by email and (after the fix) by id */
function mockUserLookups(opts: { byEmail: unknown; byId: unknown }) {
  vi.mocked(prisma.user.findUnique as any).mockImplementation(async ({ where }: any) => {
    if (where?.email !== undefined) return opts.byEmail
    return opts.byId
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit as any).mockResolvedValue({ limited: false, resetAt: 0 })
  vi.mocked(hashPassword as any).mockResolvedValue('hashed')
  vi.mocked(createSession as any).mockResolvedValue('token')
  vi.mocked(prisma.user.create as any).mockImplementation(async ({ data }: any) => ({ ...data }))
})

describe('POST /api/auth/sync — user creation', () => {
  it('creates the user under the requested id when it is free', async () => {
    mockUserLookups({ byEmail: null, byId: null })

    const res = await POST(makeRequest(SYNC_BODY))

    expect(res.status).toBe(200)
    const createArgs = vi.mocked(prisma.user.create).mock.calls[0][0] as any
    expect(createArgs.data.id).toBe('seed_user_001')
    expect(createArgs.data.email).toBe('user@test.com')
  })

  it('creates the user under a generated id when the requested id belongs to another account', async () => {
    // seed_user_001 already taken by a different email in the shared DB
    mockUserLookups({ byEmail: null, byId: { id: 'seed_user_001' } })

    const res = await POST(makeRequest(SYNC_BODY))

    expect(res.status).toBe(200)
    const createArgs = vi.mocked(prisma.user.create).mock.calls[0][0] as any
    expect(createArgs.data.id).toBeTruthy()
    expect(createArgs.data.id).not.toBe('seed_user_001')
    expect(createArgs.data.email).toBe('user@test.com')
  })

  it('retries with a generated id when create races into a unique conflict', async () => {
    mockUserLookups({ byEmail: null, byId: null })
    vi.mocked(prisma.user.create as any)
      .mockRejectedValueOnce({ code: 'P2002' })
      .mockImplementationOnce(async ({ data }: any) => ({ ...data }))

    const res = await POST(makeRequest(SYNC_BODY))

    expect(res.status).toBe(200)
    expect(prisma.user.create).toHaveBeenCalledTimes(2)
    const retryArgs = vi.mocked(prisma.user.create).mock.calls[1][0] as any
    expect(retryArgs.data.id).not.toBe('seed_user_001')
  })

  it('still rejects a wrong password for an existing account', async () => {
    mockUserLookups({
      byEmail: { id: 'u1', email: 'user@test.com', passwordHash: 'hash' },
      byId: null,
    })
    vi.mocked(verifyPassword as any).mockResolvedValue(false)

    const res = await POST(makeRequest(SYNC_BODY))

    expect(res.status).toBe(401)
    expect(prisma.user.create).not.toHaveBeenCalled()
  })
})
