import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  userFindUniqueMock,
  userUpdateMock,
  sessionDeleteManyMock,
  getServerUserMock,
  hashPasswordMock,
  verifyPasswordMock,
  createSessionMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  userUpdateMock: vi.fn(),
  sessionDeleteManyMock: vi.fn(),
  getServerUserMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  createSessionMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock, update: userUpdateMock },
    session: { deleteMany: sessionDeleteManyMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: getServerUserMock,
  hashPassword: hashPasswordMock,
  verifyPassword: verifyPasswordMock,
  createSession: createSessionMock,
  SESSION_COOKIE: 'eshop_session',
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/user/password', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      cookie: 'eshop_session=tok',
      origin: 'http://localhost',
    },
  })
}

const SESSION_USER = { id: 'u1', email: 'user@test.com' }

beforeEach(() => {
  vi.clearAllMocks()
  getServerUserMock.mockResolvedValue(SESSION_USER)
  hashPasswordMock.mockResolvedValue('NEW_HASH')
  userUpdateMock.mockResolvedValue({ id: 'u1' })
  sessionDeleteManyMock.mockResolvedValue({ count: 1 })
  createSessionMock.mockResolvedValue('new-token')
})

describe('POST /api/user/password', () => {
  it('rejects a cross-site Origin (CSRF guard)', async () => {
    const req = new NextRequest('http://localhost/api/user/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'user123', newPassword: 'newpassword1' }),
      headers: { 'Content-Type': 'application/json', cookie: 'eshop_session=tok', origin: 'https://evil.test' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(getServerUserMock).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated callers', async () => {
    getServerUserMock.mockResolvedValue(null)
    const res = await POST(makeRequest({ currentPassword: 'user123', newPassword: 'newpassword1' }))
    expect(res.status).toBe(401)
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects a too-short new password', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: false,
    })
    const res = await POST(makeRequest({ currentPassword: 'user123', newPassword: 'short1' }))
    expect(res.status).toBe(400)
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it('rejects a wrong current password for a normal user', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: false,
    })
    verifyPasswordMock.mockResolvedValue(false)
    const res = await POST(makeRequest({ currentPassword: 'wrong', newPassword: 'newpassword1' }))
    expect(res.status).toBe(401)
    expect(userUpdateMock).not.toHaveBeenCalled()
  })

  it('writes a fresh hash to the DB when the current password is correct', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: false,
    })
    verifyPasswordMock.mockResolvedValue(true)
    const res = await POST(makeRequest({ currentPassword: 'user123', newPassword: 'newpassword1' }))
    expect(res.status).toBe(200)
    const args = userUpdateMock.mock.calls[0][0] as {
      where: { id: string }
      data: { passwordHash: string; mustChangePassword: boolean }
    }
    expect(args.where).toEqual({ id: 'u1' })
    expect(args.data.passwordHash).toBe('NEW_HASH')
    expect(args.data.mustChangePassword).toBe(false)

    // A password change must rotate sessions: kill every existing one and issue a fresh cookie.
    expect(sessionDeleteManyMock).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    expect(createSessionMock).toHaveBeenCalledWith('u1')
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
  })

  it('allows a forced (mustChangePassword) user to set a new password without the current one', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: true,
    })
    const res = await POST(makeRequest({ newPassword: 'newpassword1' }))
    expect(res.status).toBe(200)
    expect(verifyPasswordMock).not.toHaveBeenCalled()
    const args = userUpdateMock.mock.calls[0][0] as {
      data: { passwordHash: string; mustChangePassword: boolean }
    }
    expect(args.data.passwordHash).toBe('NEW_HASH')
    expect(args.data.mustChangePassword).toBe(false)
  })
})
