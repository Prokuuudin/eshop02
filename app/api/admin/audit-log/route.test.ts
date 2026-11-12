import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { findManyMock, countMock, userFindManyMock, requirePermissionMock } = vi.hoisted(() => ({
  findManyMock: vi.fn(),
  countMock: vi.fn(),
  userFindManyMock: vi.fn(),
  requirePermissionMock: vi.fn(),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    auditLog: { findMany: findManyMock, count: countMock },
    user: { findMany: userFindManyMock },
  },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: requirePermissionMock }))

import { GET } from './route'

const row = (id: string, adminEmail: string, actorUserId: string | null) => ({
  id, sequence: BigInt(id.length), at: new Date('2026-11-01T10:00:00Z'), adminEmail, actorUserId,
  action: 'product.update', entityType: 'product', entityId: 'p1',
})
const get = () => GET(new NextRequest('http://localhost/api/admin/audit-log?skip=0&take=50'))

beforeEach(() => {
  vi.clearAllMocks()
  requirePermissionMock.mockResolvedValue({ id: 'u-admin', platformRole: 'admin' })
})

describe('GET /api/admin/audit-log', () => {
  it('requires audit.read and never reads the log otherwise', async () => {
    requirePermissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const response = await get()
    expect(response.status).toBe(403)
    expect(requirePermissionMock).toHaveBeenCalledWith('audit.read')
    expect(findManyMock).not.toHaveBeenCalled()
    expect(userFindManyMock).not.toHaveBeenCalled()
  })

  it('returns entries unchanged plus the current standing of their actors', async () => {
    findManyMock.mockResolvedValue([
      row('a1', 'boss@example.test', 'u-admin'),
      row('a2', 'old-admin@example.test', 'u-revoked'),
      row('a3', 'gone@example.invalid', 'u-gone'),
    ])
    countMock.mockResolvedValue(3)
    userFindManyMock.mockResolvedValue([
      { id: 'u-admin', email: 'boss@example.test', platformRole: 'admin', teamRole: null },
      { id: 'u-revoked', email: 'old-admin@example.test', platformRole: 'customer', teamRole: null },
    ])

    const response = await get()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.total).toBe(3)
    expect(body.entries.map((entry: { adminEmail: string }) => entry.adminEmail))
      .toEqual(['boss@example.test', 'old-admin@example.test', 'gone@example.invalid'])
    expect(body.actorStatus).toEqual({
      'boss@example.test': 'staff',
      'old-admin@example.test': 'former',
      'gone@example.invalid': 'deleted',
    })
    expect(userFindManyMock).toHaveBeenCalledWith({
      where: { OR: [{ id: { in: ['u-admin', 'u-revoked', 'u-gone'] } }, { email: { in: [], mode: 'insensitive' } }] },
      select: { id: true, email: true, platformRole: true, teamRole: true },
    })
  })

  it('skips the user lookup for an empty page', async () => {
    findManyMock.mockResolvedValue([])
    countMock.mockResolvedValue(0)
    const body = await (await get()).json()
    expect(body).toEqual({ entries: [], total: 0, actorStatus: {} })
    expect(userFindManyMock).not.toHaveBeenCalled()
  })
})
