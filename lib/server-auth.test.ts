import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))

const cookieGet = vi.fn()
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: { findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  },
}))

import { requireAdmin } from './server-auth'
import { prisma } from '@/lib/prisma'

function futureDate() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}

function makeSession(platformRole: string) {
  return {
    token: 'tok',
    expiresAt: futureDate(),
    user: {
      id: 'u1',
      email: 'a@b.c',
      platformRole,
      approvalRequired: false,
      auditLoggingEnabled: false,
      bonusPoints: 0,
      mustChangePassword: false,
      createdAt: new Date(),
    },
  }
}

describe('requireAdmin', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 403 when no session cookie', async () => {
    cookieGet.mockReturnValue(undefined)
    const res = await requireAdmin()
    expect(res).toBeInstanceOf(NextResponse)
    expect((res as NextResponse).status).toBe(403)
  })

  it('returns 403 when session user is not admin', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    vi.mocked(prisma.session.findUnique as any).mockResolvedValue(makeSession('customer'))
    const res = await requireAdmin()
    expect(res).toBeInstanceOf(NextResponse)
    expect((res as NextResponse).status).toBe(403)
  })

  it('returns the admin user when session user is admin', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    vi.mocked(prisma.session.findUnique as any).mockResolvedValue(makeSession('admin'))
    const res = await requireAdmin()
    expect(res).not.toBeInstanceOf(NextResponse)
    expect((res as any).platformRole).toBe('admin')
    expect((res as any).id).toBe('u1')
  })

  it('returns 403 when session is expired', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const expired = makeSession('admin')
    expired.expiresAt = new Date(Date.now() - 1000)
    vi.mocked(prisma.session.findUnique as any).mockResolvedValue(expired)
    const res = await requireAdmin()
    expect(res).toBeInstanceOf(NextResponse)
    expect((res as NextResponse).status).toBe(403)
  })
})
