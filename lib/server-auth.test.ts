import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))

const cookieGet = vi.fn()
const { sessionFindUniqueMock, sessionCreateMock, userCountMock, userFindUniqueMock } = vi.hoisted(() => ({
  sessionFindUniqueMock: vi.fn(),
  sessionCreateMock: vi.fn(),
  userCountMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: { findUnique: sessionFindUniqueMock, create: sessionCreateMock, delete: vi.fn(), deleteMany: vi.fn() },
    user: { count: userCountMock, findUnique: userFindUniqueMock },
  },
}))

import { createSession, getAdminAccessLevel, getServerUser, hasAdminUsersInDb, requireAdmin, requireAdminPermission, type ServerUser } from './server-auth'

function futureDate() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}

function makeSession(platformRole: string, mfaVerified = true) {
  return {
    tokenHash: 'hash',
    expiresAt: futureDate(),
    mfaVerified,
    user: {
      id: 'u1',
      email: 'a@b.c',
      platformRole,
      teamRole: undefined as string | undefined,
      companyId: undefined as string | undefined,
      pkLast3: undefined as string | undefined,
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

  it('returns 401 when no session cookie', async () => {
    cookieGet.mockReturnValue(undefined)
    const res = await requireAdmin()
    expect(res).toBeInstanceOf(NextResponse)
    expect((res as NextResponse).status).toBe(401)
  })

  it('returns 403 when session user is not admin', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    sessionFindUniqueMock.mockResolvedValue(makeSession('customer'))
    const res = await requireAdmin()
    expect(res).toBeInstanceOf(NextResponse)
    expect((res as NextResponse).status).toBe(403)
  })

  it('returns the admin user when session user is admin', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    sessionFindUniqueMock.mockResolvedValue(makeSession('admin'))
    const res = await requireAdmin()
    expect(res).not.toBeInstanceOf(NextResponse)
    expect((res as ServerUser).platformRole).toBe('admin')
    expect((res as ServerUser).id).toBe('u1')
  })

  it('returns 401 when session is expired', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const expired = makeSession('admin')
    expired.expiresAt = new Date(Date.now() - 1000)
    sessionFindUniqueMock.mockResolvedValue(expired)
    const res = await requireAdmin()
    expect(res).toBeInstanceOf(NextResponse)
    expect((res as NextResponse).status).toBe(401)
  })
})

describe('requireAdminPermission', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a manager to work with orders', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer')
    session.user.teamRole = 'manager'
    sessionFindUniqueMock.mockResolvedValue(session)
    expect(await requireAdminPermission('orders.read')).not.toBeInstanceOf(NextResponse)
    expect(await requireAdminPermission('orders.update')).not.toBeInstanceOf(NextResponse)
  })

  it('denies a manager user and catalog administration', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer')
    session.user.teamRole = 'manager'
    sessionFindUniqueMock.mockResolvedValue(session)
    const users = await requireAdminPermission('users.manage')
    const catalog = await requireAdminPermission('catalog.update')
    expect((users as NextResponse).status).toBe(403)
    expect((catalog as NextResponse).status).toBe(403)
  })
})

describe('mandatory admin MFA at the session layer', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejects an admin session that was not MFA-verified (password-only / legacy / other route)', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    sessionFindUniqueMock.mockResolvedValue(makeSession('admin', false))

    expect(await getServerUser()).toBeNull()
    expect(await getServerUser({ allowPasswordChangeRequired: true })).toBeNull()
    const gate = await requireAdminPermission('admin.access')
    expect((gate as NextResponse).status).toBe(401)
  })

  it('rejects a manager session that was not MFA-verified', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer', false)
    session.user.teamRole = 'manager'
    sessionFindUniqueMock.mockResolvedValue(session)

    const gate = await requireAdminPermission('orders.read')
    expect((gate as NextResponse).status).toBe(401)
  })

  it('does not affect customers: their sessions never need the MFA flag', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    sessionFindUniqueMock.mockResolvedValue(makeSession('customer', false))

    expect(await getServerUser()).toMatchObject({ id: 'u1', platformRole: 'customer' })
  })

  it('accepts an MFA-verified admin session', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    sessionFindUniqueMock.mockResolvedValue(makeSession('admin', true))

    expect(await getAdminAccessLevel(await getServerUser())).toBe('admin')
  })
})

describe('restricted onboarding session', () => {
  beforeEach(() => vi.clearAllMocks())

  it('is hidden from normal server authorization until the password is changed', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer')
    session.user.mustChangePassword = true
    sessionFindUniqueMock.mockResolvedValue(session)

    expect(await getServerUser()).toBeNull()
    expect(await getServerUser({ allowPasswordChangeRequired: true })).toMatchObject({
      id: 'u1',
      mustChangePassword: true,
    })
  })

  it('keeps the hard block for a verified individual card+PK login too — pkLast3 no longer softens it', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer')
    session.user.mustChangePassword = true
    session.user.pkLast3 = 'X9Z'
    sessionFindUniqueMock.mockResolvedValue(session)

    expect(await getServerUser()).toBeNull()
  })

  it('keeps the hard block for a B2B shared-password session', async () => {
    cookieGet.mockReturnValue({ value: 'tok' })
    const session = makeSession('customer')
    session.user.mustChangePassword = true
    session.user.companyId = 'company_1'
    sessionFindUniqueMock.mockResolvedValue(session)

    expect(await getServerUser()).toBeNull()
  })
})

function makeServerUser(overrides: Partial<ServerUser> = {}): ServerUser {
  return {
    id: 'u1',
    email: 'a@b.c',
    platformRole: 'customer',
    approvalRequired: false,
    auditLoggingEnabled: false,
    bonusPoints: 0,
    mustChangePassword: false,
    createdAt: '2026-07-04T10:00:00.000Z',
    ...overrides,
  }
}

describe('mapDbToServerUser', () => {
  it('never exposes the TOTP secret or recovery-code hashes', async () => {
    const { mapDbToServerUser } = await import('./server-auth')
    const mapped = mapDbToServerUser({
      ...makeSession('admin').user, mfaEnabled: true, mfaSecret: 'iv.tag.ct', mfaBackupCodes: ['$2b$12$x'],
    } as never)
    const json = JSON.stringify(mapped)
    expect(json).not.toContain('iv.tag.ct')
    expect(json).not.toContain('$2b$12$x')
    expect(mapped).not.toHaveProperty('mfaSecret')
    expect(mapped).not.toHaveProperty('mfaBackupCodes')
  })
})

describe('getAdminAccessLevel', () => {
  it('returns none for no session', () => {
    expect(getAdminAccessLevel(null)).toBe('none')
  })

  it('returns admin for platformRole admin', () => {
    expect(getAdminAccessLevel(makeServerUser({ platformRole: 'admin' }))).toBe('admin')
  })

  it('returns manager for teamRole manager', () => {
    expect(getAdminAccessLevel(makeServerUser({ teamRole: 'manager' }))).toBe('manager')
  })

  it('returns none for a plain customer', () => {
    expect(getAdminAccessLevel(makeServerUser())).toBe('none')
  })
})

describe('createSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    sessionCreateMock.mockResolvedValue(undefined)
  })

  it('gives an admin a ~1 day session', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'admin' })
    await createSession('u1')
    const { expiresAt } = sessionCreateMock.mock.calls[0][0].data as { expiresAt: Date }
    const days = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(days).toBeGreaterThan(0.9)
    expect(days).toBeLessThan(1.1)
  })

  it('stores mfaVerified=false unless the caller explicitly verified a second factor', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'admin' })
    await createSession('u1')
    await createSession('u1', { mfaVerified: true })
    expect(sessionCreateMock.mock.calls[0][0].data.mfaVerified).toBe(false)
    expect(sessionCreateMock.mock.calls[1][0].data.mfaVerified).toBe(true)
  })

  it('gives a staff manager the short admin session lifetime', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'customer', teamRole: 'manager' })
    await createSession('u1', { mfaVerified: true })
    const { expiresAt } = sessionCreateMock.mock.calls[0][0].data as { expiresAt: Date }
    expect((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)).toBeLessThan(1.1)
  })

  it('gives a non-admin a ~30 day session', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'customer' })
    await createSession('u1')
    const { expiresAt } = sessionCreateMock.mock.calls[0][0].data as { expiresAt: Date }
    const days = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
  })
})

describe('hasAdminUsersInDb', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns true when at least one admin exists', async () => {
    userCountMock.mockResolvedValue(1)
    expect(await hasAdminUsersInDb()).toBe(true)
  })

  it('returns false when no admin exists', async () => {
    userCountMock.mockResolvedValue(0)
    expect(await hasAdminUsersInDb()).toBe(false)
  })

  it('fails closed to true (assume admin exists) if the DB call throws', async () => {
    userCountMock.mockRejectedValue(new Error('db down'))
    expect(await hasAdminUsersInDb()).toBe(true)
  })
})
