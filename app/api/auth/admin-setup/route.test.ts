import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { transactionMock, hashPasswordMock, createSessionMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(), hashPasswordMock: vi.fn(), createSessionMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transactionMock } }))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock,
  createSession: createSessionMock,
  mapDbToServerUser: vi.fn((user: unknown) => user),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))

import { POST } from './route'

function request(body: Record<string, unknown>) {
  return new NextRequest('http://localhost/api/auth/admin-setup', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  hashPasswordMock.mockResolvedValue('hashed-password')
  createSessionMock.mockResolvedValue('session-token')
})

describe('POST /api/auth/admin-setup', () => {
  it('creates the first admin in the database and starts a session', async () => {
    const create = vi.fn(async ({ data }) => ({ ...data }))
    transactionMock.mockImplementation(async (callback) => callback({
      user: { count: vi.fn().mockResolvedValue(0), create },
    }))

    const response = await POST(request({
      email: ' First.Admin@Example.com ', password: 'StrongPass123', name: 'First Admin',
    }))

    expect(response.status).toBe(201)
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({
      email: 'first.admin@example.com', passwordHash: 'hashed-password', platformRole: 'admin',
    }) })
    expect(createSessionMock).toHaveBeenCalled()
    expect(response.cookies.get('eshop_session')?.value).toBe('session-token')
  })

  it('refuses setup when an administrator already exists', async () => {
    transactionMock.mockImplementation(async (callback) => callback({
      user: { count: vi.fn().mockResolvedValue(1), create: vi.fn() },
    }))

    const response = await POST(request({ email: 'next@example.com', password: 'StrongPass123' }))

    expect(response.status).toBe(409)
    expect(createSessionMock).not.toHaveBeenCalled()
  })
})
