import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: vi.fn(),
  hashPassword: vi.fn(),
  verifyPassword: vi.fn(),
  createSession: vi.fn(),
  SESSION_COOKIE: 'eshop_session',
}))

import { prisma } from '@/lib/prisma'
import { getServerUser, hashPassword, verifyPassword, createSession } from '@/lib/server-auth'
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
  vi.mocked(getServerUser as any).mockResolvedValue(SESSION_USER)
  vi.mocked(hashPassword as any).mockResolvedValue('NEW_HASH')
  vi.mocked(prisma.user.update as any).mockResolvedValue({ id: 'u1' })
  vi.mocked(prisma.session.deleteMany as any).mockResolvedValue({ count: 1 })
  vi.mocked(createSession as any).mockResolvedValue('new-token')
})

describe('POST /api/user/password', () => {
  it('rejects a cross-site Origin (CSRF guard)', async () => {
    const req = new NextRequest('http://localhost/api/user/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword: 'user123', newPassword: 'newpass1' }),
      headers: { 'Content-Type': 'application/json', cookie: 'eshop_session=tok', origin: 'https://evil.test' },
    })
    const res = await POST(req)
    expect(res.status).toBe(403)
    expect(getServerUser).not.toHaveBeenCalled()
  })

  it('rejects unauthenticated callers', async () => {
    vi.mocked(getServerUser as any).mockResolvedValue(null)
    const res = await POST(makeRequest({ currentPassword: 'user123', newPassword: 'newpass1' }))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('rejects a too-short new password', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: false,
    })
    const res = await POST(makeRequest({ currentPassword: 'user123', newPassword: '123' }))
    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('rejects a wrong current password for a normal user', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: false,
    })
    vi.mocked(verifyPassword as any).mockResolvedValue(false)
    const res = await POST(makeRequest({ currentPassword: 'wrong', newPassword: 'newpass1' }))
    expect(res.status).toBe(401)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('writes a fresh hash to the DB when the current password is correct', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: false,
    })
    vi.mocked(verifyPassword as any).mockResolvedValue(true)
    const res = await POST(makeRequest({ currentPassword: 'user123', newPassword: 'newpass1' }))
    expect(res.status).toBe(200)
    const args = vi.mocked(prisma.user.update).mock.calls[0][0] as any
    expect(args.where).toEqual({ id: 'u1' })
    expect(args.data.passwordHash).toBe('NEW_HASH')
    expect(args.data.mustChangePassword).toBe(false)

    // A password change must rotate sessions: kill every existing one and issue a fresh cookie.
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    expect(createSession).toHaveBeenCalledWith('u1')
    expect(res.cookies.get('eshop_session')?.value).toBe('new-token')
  })

  it('allows a forced (mustChangePassword) user to set a new password without the current one', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue({
      id: 'u1', passwordHash: 'OLD', mustChangePassword: true,
    })
    const res = await POST(makeRequest({ newPassword: 'newpass1' }))
    expect(res.status).toBe(200)
    expect(verifyPassword).not.toHaveBeenCalled()
    const args = vi.mocked(prisma.user.update).mock.calls[0][0] as any
    expect(args.data.passwordHash).toBe('NEW_HASH')
    expect(args.data.mustChangePassword).toBe(false)
  })
})
