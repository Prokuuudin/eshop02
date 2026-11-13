import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

vi.mock('server-only', () => ({}))

const cookieGet = vi.fn()
const {
  sessionFindUniqueMock,
  sessionCreateMock,
  sessionUpdateManyMock,
  sessionDeleteManyMock,
  userCountMock,
  userFindUniqueMock,
} = vi.hoisted(() => ({
  sessionFindUniqueMock: vi.fn(),
  sessionCreateMock: vi.fn(),
  sessionUpdateManyMock: vi.fn(),
  sessionDeleteManyMock: vi.fn(),
  userCountMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}))

vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => ({ get: cookieGet })),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    session: {
      findUnique: sessionFindUniqueMock,
      create: sessionCreateMock,
      updateMany: sessionUpdateManyMock,
      delete: vi.fn(),
      deleteMany: sessionDeleteManyMock,
    },
    user: { count: userCountMock, findUnique: userFindUniqueMock },
  },
}))

import {
  createSession,
  getAdminAccessLevel,
  getServerUser,
  getStaffSessionStatus,
  hasAdminUsersInDb,
  requireAdmin,
  requireAdminPermission,
  sessionCookieMaxAgeSeconds,
  type ServerUser,
} from './server-auth'
import { ADMIN_SESSION_MAX_AGE_MS, ADMIN_SESSION_PRESENCE_GRACE_MS } from './admin-session-policy'

const MINUTE = 60 * 1000
const HOUR = 60 * MINUTE

// Defaults fit both policies: a staff session signed in a minute ago whose browser
// reported presence a minute ago, and an ordinary customer session.
function makeSession(platformRole: string, mfaVerified = true) {
  return {
    tokenHash: 'hash',
    createdAt: new Date(Date.now() - MINUTE),
    expiresAt: new Date(Date.now() + 2 * MINUTE),
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

beforeEach(() => {
  sessionUpdateManyMock.mockResolvedValue({ count: 1 })
  sessionDeleteManyMock.mockResolvedValue({ count: 1 })
})

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

  it('reports superAdmin only for platform admins carrying the flag', async () => {
    const { mapDbToServerUser } = await import('./server-auth')
    const base = makeSession('admin').user
    expect(mapDbToServerUser({ ...base, superAdmin: true } as never).superAdmin).toBe(true)
    expect(mapDbToServerUser({ ...base, superAdmin: false } as never).superAdmin).toBe(false)
    expect(mapDbToServerUser({ ...base, platformRole: 'customer', superAdmin: true } as never).superAdmin).toBe(false)
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

  it('gives an admin a short presence deadline and records the sign-in time', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'admin' })
    const before = Date.now()
    await createSession('u1', { mfaVerified: true })
    const { expiresAt, createdAt } = sessionCreateMock.mock.calls[0][0].data as { expiresAt: Date; createdAt: Date }
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(expiresAt.getTime() - createdAt.getTime()).toBe(ADMIN_SESSION_PRESENCE_GRACE_MS)
  })

  it('stores mfaVerified=false unless the caller explicitly verified a second factor', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'admin' })
    await createSession('u1')
    await createSession('u1', { mfaVerified: true })
    expect(sessionCreateMock.mock.calls[0][0].data.mfaVerified).toBe(false)
    expect(sessionCreateMock.mock.calls[1][0].data.mfaVerified).toBe(true)
  })

  it('gives a staff manager the same staff session policy', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'customer', teamRole: 'manager' })
    await createSession('u1', { mfaVerified: true })
    const { expiresAt } = sessionCreateMock.mock.calls[0][0].data as { expiresAt: Date }
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(ADMIN_SESSION_PRESENCE_GRACE_MS)
  })

  it('keeps the original sign-in time when a staff session is rotated', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'admin' })
    const signedInAt = new Date(Date.now() - 2 * HOUR)
    await createSession('u1', { mfaVerified: true, authenticatedAt: signedInAt })
    const { createdAt } = sessionCreateMock.mock.calls[0][0].data as { createdAt: Date }
    expect(createdAt).toEqual(signedInAt)
  })

  it('never lets a rotation outlive 8 hours from the original sign-in', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'admin' })
    const signedInAt = new Date(Date.now() - ADMIN_SESSION_MAX_AGE_MS - MINUTE)
    await createSession('u1', { mfaVerified: true, authenticatedAt: signedInAt })
    const { expiresAt } = sessionCreateMock.mock.calls[0][0].data as { expiresAt: Date }
    expect(expiresAt.getTime()).toBe(signedInAt.getTime() + ADMIN_SESSION_MAX_AGE_MS)
    expect(expiresAt.getTime()).toBeLessThan(Date.now())
  })

  it('ignores a sign-in time in the future', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'admin' })
    const before = Date.now()
    await createSession('u1', { mfaVerified: true, authenticatedAt: new Date(Date.now() + HOUR) })
    const { createdAt } = sessionCreateMock.mock.calls[0][0].data as { createdAt: Date }
    expect(createdAt.getTime()).toBeLessThanOrEqual(Date.now())
    expect(createdAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('gives a non-admin a ~30 day session', async () => {
    userFindUniqueMock.mockResolvedValue({ platformRole: 'customer' })
    await createSession('u1')
    const { expiresAt } = sessionCreateMock.mock.calls[0][0].data as { expiresAt: Date }
    const days = (expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
    expect(days).toBeGreaterThan(29.9)
    expect(days).toBeLessThan(30.1)
    expect(sessionCreateMock.mock.calls[0][0].data).not.toHaveProperty('createdAt')
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

describe('staff session limits (lib/admin-session-policy.ts)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    cookieGet.mockReturnValue({ value: 'tok' })
    sessionUpdateManyMock.mockResolvedValue({ count: 1 })
    sessionDeleteManyMock.mockResolvedValue({ count: 1 })
  })

  function staffSession(createdAgoMs: number, expiresInMs: number, role: 'admin' | 'manager' = 'admin') {
    const session = makeSession(role === 'admin' ? 'admin' : 'customer')
    if (role === 'manager') session.user.teamRole = 'manager'
    session.createdAt = new Date(Date.now() - createdAgoMs)
    session.expiresAt = new Date(Date.now() + expiresInMs)
    return session
  }

  it('ends a staff session 8 hours after sign-in even while the browser keeps reporting presence', async () => {
    sessionFindUniqueMock.mockResolvedValue(staffSession(ADMIN_SESSION_MAX_AGE_MS + 1000, MINUTE))

    expect(await getServerUser()).toBeNull()
    expect(sessionDeleteManyMock).toHaveBeenCalledWith({ where: { tokenHash: expect.any(String) } })
    expect(sessionUpdateManyMock).not.toHaveBeenCalled()
  })

  it('applies the 8-hour limit to managers too', async () => {
    sessionFindUniqueMock.mockResolvedValue(staffSession(ADMIN_SESSION_MAX_AGE_MS + 1000, MINUTE, 'manager'))
    const gate = await requireAdminPermission('orders.read')
    expect((gate as NextResponse).status).toBe(401)
  })

  it('never moves the presence deadline past the 8-hour limit', async () => {
    const session = staffSession(ADMIN_SESSION_MAX_AGE_MS - MINUTE, 5 * 1000)
    sessionFindUniqueMock.mockResolvedValue(session)

    expect(await getServerUser()).toMatchObject({ id: 'u1' })
    const limit = session.createdAt.getTime() + ADMIN_SESSION_MAX_AGE_MS
    expect(sessionUpdateManyMock).toHaveBeenCalledTimes(1)
    const update = sessionUpdateManyMock.mock.calls[0][0] as { data: { expiresAt: Date } }
    expect(update.data.expiresAt.getTime()).toBe(limit)
  })

  it('requires a new sign-in when the browser was closed and later restored its session cookie', async () => {
    // No presence for longer than the grace window: the server already considers the browser gone.
    sessionFindUniqueMock.mockResolvedValue(staffSession(HOUR, -1000))

    expect(await getServerUser()).toBeNull()
    const gate = await requireAdminPermission('admin.access')
    expect((gate as NextResponse).status).toBe(401)
  })

  it('keeps a session whose browser is still open (presence within the grace window)', async () => {
    sessionFindUniqueMock.mockResolvedValue(staffSession(HOUR, MINUTE))
    expect(await getServerUser()).toMatchObject({ id: 'u1', platformRole: 'admin' })
  })

  it('refreshes presence on an authenticated request, conditional on the row still being live', async () => {
    const session = staffSession(HOUR, MINUTE)
    sessionFindUniqueMock.mockResolvedValue(session)

    await getServerUser()
    expect(sessionUpdateManyMock).toHaveBeenCalledTimes(1)
    const { where, data } = sessionUpdateManyMock.mock.calls[0][0] as {
      where: { tokenHash: string; expiresAt: { gt: Date } }
      data: { expiresAt: Date }
    }
    expect(where.expiresAt.gt).toBeInstanceOf(Date)
    expect(data.expiresAt.getTime() - Date.now()).toBeGreaterThan(ADMIN_SESSION_PRESENCE_GRACE_MS - 5000)
    expect(data.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(ADMIN_SESSION_PRESENCE_GRACE_MS)
  })

  it('does not rewrite the row on every request', async () => {
    sessionFindUniqueMock.mockResolvedValue(staffSession(HOUR, ADMIN_SESSION_PRESENCE_GRACE_MS - 5000))
    expect(await getServerUser()).toMatchObject({ id: 'u1' })
    expect(sessionUpdateManyMock).not.toHaveBeenCalled()
  })

  it('rejects admin sessions issued before this policy (1-day expiry)', async () => {
    sessionFindUniqueMock.mockResolvedValue(staffSession(HOUR, 23 * HOUR))
    expect(await getServerUser()).toBeNull()
    expect(sessionDeleteManyMock).toHaveBeenCalled()
  })

  it('handles parallel requests: both pass while the session is live', async () => {
    sessionFindUniqueMock.mockResolvedValue(staffSession(HOUR, MINUTE))
    const [a, b] = await Promise.all([getServerUser(), getServerUser()])
    expect(a).toMatchObject({ id: 'u1' })
    expect(b).toMatchObject({ id: 'u1' })
  })

  it('handles a request racing a logout: once the row is gone it is not revived and access is denied', async () => {
    sessionFindUniqueMock.mockResolvedValue(staffSession(HOUR, MINUTE))
    sessionUpdateManyMock.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    const [a, b] = await Promise.all([getServerUser(), getServerUser()])
    expect([a, b].filter(Boolean)).toHaveLength(1)
    expect(sessionCreateMock).not.toHaveBeenCalled()
  })

  it('denies every admin API once the session row is revoked (after logout)', async () => {
    sessionFindUniqueMock.mockResolvedValue(null)
    for (const permission of ['admin.access', 'orders.read', 'users.manage', 'staff.manage'] as const) {
      const gate = await requireAdminPermission(permission)
      expect((gate as NextResponse).status).toBe(401)
    }
  })

  it('still requires MFA: a non-verified staff session is rejected even inside both limits', async () => {
    const session = staffSession(MINUTE, MINUTE)
    session.mfaVerified = false
    sessionFindUniqueMock.mockResolvedValue(session)
    expect(await getServerUser()).toBeNull()
    expect(sessionUpdateManyMock).not.toHaveBeenCalled()
  })

  it('leaves customer sessions untouched: no presence tracking, no 8-hour limit', async () => {
    const session = makeSession('customer', false)
    session.createdAt = new Date(Date.now() - 10 * 24 * HOUR)
    session.expiresAt = new Date(Date.now() + 20 * 24 * HOUR)
    sessionFindUniqueMock.mockResolvedValue(session)

    expect(await getServerUser()).toMatchObject({ id: 'u1', platformRole: 'customer' })
    expect(sessionUpdateManyMock).not.toHaveBeenCalled()
    expect(sessionDeleteManyMock).not.toHaveBeenCalled()
    expect(await getStaffSessionStatus()).toBeNull()
  })

  it('reports the absolute deadline of a live staff session, including during a forced password change', async () => {
    const session = staffSession(HOUR, MINUTE)
    session.user.mustChangePassword = true
    sessionFindUniqueMock.mockResolvedValue(session)

    expect(await getServerUser()).toBeNull()
    const status = await getStaffSessionStatus()
    expect(status?.absoluteExpiresAt.getTime()).toBe(session.createdAt.getTime() + ADMIN_SESSION_MAX_AGE_MS)
  })
})

describe('sessionCookieMaxAgeSeconds', () => {
  it('gives staff a browser session cookie (no Max-Age)', () => {
    expect(sessionCookieMaxAgeSeconds({ platformRole: 'admin' })).toBeUndefined()
    expect(sessionCookieMaxAgeSeconds({ platformRole: 'customer', teamRole: 'manager' })).toBeUndefined()
  })

  it('keeps the 30-day cookie for customers', () => {
    expect(sessionCookieMaxAgeSeconds({ platformRole: 'customer' })).toBe(30 * 24 * 60 * 60)
    expect(sessionCookieMaxAgeSeconds({ platformRole: 'customer', teamRole: 'admin' })).toBe(30 * 24 * 60 * 60)
  })
})
