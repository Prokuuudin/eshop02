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
  sessionFindUniqueMock,
} = vi.hoisted(() => ({
  userFindUniqueMock: vi.fn(),
  userUpdateMock: vi.fn(),
  sessionDeleteManyMock: vi.fn(),
  getServerUserMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  verifyPasswordMock: vi.fn(),
  createSessionMock: vi.fn(),
  sessionFindUniqueMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: userFindUniqueMock, update: userUpdateMock },
    session: { deleteMany: sessionDeleteManyMock, findUnique: sessionFindUniqueMock },
  },
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), resetRateLimit: vi.fn() }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: (name: string) => (name === 'eshop_session' ? { value: 'tok' } : undefined) }),
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: getServerUserMock,
  requiresAdminMfa: (u: { platformRole?: string | null; teamRole?: string | null } | null) => u?.platformRole === 'admin' || u?.teamRole === 'manager',
  sessionCookieMaxAgeSeconds: (u: { platformRole?: string | null; teamRole?: string | null }) =>
    u.platformRole === 'admin' || u.teamRole === 'manager' ? undefined : 60 * 60 * 24 * 30,
  hashToken: (token: string) => `hash:${token}`,
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
const SIGNED_IN_AT = new Date('2026-11-13T08:00:00.000Z')

beforeEach(() => {
  vi.clearAllMocks()
  getServerUserMock.mockResolvedValue(SESSION_USER)
  hashPasswordMock.mockResolvedValue('NEW_HASH')
  userUpdateMock.mockResolvedValue({ id: 'u1' })
  sessionDeleteManyMock.mockResolvedValue({ count: 1 })
  createSessionMock.mockResolvedValue('new-token')
  sessionFindUniqueMock.mockResolvedValue({ createdAt: SIGNED_IN_AT })
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
    expect(createSessionMock).toHaveBeenCalledWith('u1', { mfaVerified: false, authenticatedAt: undefined })
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
    // Customers keep the same persistent 30-day cookie as before.
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=2592000/i)
    expect(sessionFindUniqueMock).not.toHaveBeenCalled()
  })

  it('keeps an admin MFA-verified when rotating their (already MFA-verified) session', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'admin@x.lv', platformRole: 'admin', mustChangePassword: false })
    userFindUniqueMock.mockResolvedValue({ id: 'u1', passwordHash: 'OLD', mustChangePassword: false })
    verifyPasswordMock.mockResolvedValue(true)
    const res = await POST(makeRequest({ currentPassword: 'old-password', newPassword: 'newpassword1' }))
    expect(res.status).toBe(200)
    // The rotated staff session keeps the original sign-in time (8-hour limit not extended)
    // and gets a browser session cookie.
    expect(sessionFindUniqueMock).toHaveBeenCalledWith({ where: { tokenHash: 'hash:tok' }, select: { createdAt: true } })
    expect(createSessionMock).toHaveBeenCalledWith('u1', { mfaVerified: true, authenticatedAt: SIGNED_IN_AT })
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('eshop_session=new-token')
    expect(setCookie).not.toMatch(/max-age|expires=/i)
  })

  it('refuses staff whose current session row is gone, before touching the password', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'admin@x.lv', platformRole: 'admin', mustChangePassword: false })
    sessionFindUniqueMock.mockResolvedValue(null)
    const res = await POST(makeRequest({ currentPassword: 'old-password', newPassword: 'newpassword1' }))
    expect(res.status).toBe(401)
    expect(userUpdateMock).not.toHaveBeenCalled()
    expect(sessionDeleteManyMock).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('refuses a not-yet-activated customer, with or without a current password', async () => {
    userFindUniqueMock.mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: true,
    })
    verifyPasswordMock.mockResolvedValue(true)
    for (const body of [{ newPassword: 'newpassword1' }, { currentPassword: 'old-shared', newPassword: 'newpassword1' }]) {
      const res = await POST(makeRequest(body))
      expect(res.status).toBe(403)
      expect(await res.json()).toEqual({ error: 'activation_required' })
    }
    expect(userUpdateMock).not.toHaveBeenCalled()
    expect(sessionDeleteManyMock).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('still lets MFA-verified staff complete a forced change without the temporary password', async () => {
    getServerUserMock.mockResolvedValue({ id: 'u1', email: 'admin@x.lv', platformRole: 'admin' })
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
