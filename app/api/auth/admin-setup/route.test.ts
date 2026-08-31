import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { transactionMock, hashPasswordMock, createSessionMock, adminCountMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(), hashPasswordMock: vi.fn(), createSessionMock: vi.fn(), adminCountMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: { user: { count: adminCountMock }, $transaction: transactionMock } }))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock,
  createSession: createSessionMock,
  mapDbToServerUser: vi.fn((user: unknown) => user),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))

import { POST } from './route'

function request(body: Record<string, unknown>, setupToken?: string) {
  return new NextRequest('http://localhost/api/auth/admin-setup', {
    method: 'POST', headers: {
      'Content-Type': 'application/json', ...(setupToken ? { 'x-admin-setup-token': setupToken } : {}),
    }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  hashPasswordMock.mockResolvedValue('hashed-password')
  createSessionMock.mockResolvedValue('session-token')
  adminCountMock.mockResolvedValue(0)
  delete process.env.ADMIN_SETUP_TOKEN
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
    adminCountMock.mockResolvedValue(1)

    const response = await POST(request({ email: 'next@example.com', password: 'StrongPass123' }))

    expect(response.status).toBe(409)
    expect(hashPasswordMock).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid deployment token before parsing or querying', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'correct-long-bootstrap-secret'
    const response = await POST(request({ email: 'first@example.com', password: 'StrongPass123' }, 'wrong-token'))
    expect(response.status).toBe(403)
    expect(adminCountMock).not.toHaveBeenCalled()
    expect(hashPasswordMock).not.toHaveBeenCalled()
  })

  it('accepts the configured deployment token', async () => {
    process.env.ADMIN_SETUP_TOKEN = 'correct-long-bootstrap-secret'
    const create = vi.fn(async ({ data }) => ({ ...data }))
    transactionMock.mockImplementation(async (callback) => callback({
      user: { count: vi.fn().mockResolvedValue(0), create },
    }))
    const response = await POST(request(
      { email: 'first@example.com', password: 'StrongPass123' },
      'correct-long-bootstrap-secret',
    ))
    expect(response.status).toBe(201)
  })
})
