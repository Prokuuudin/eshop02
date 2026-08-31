import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { permissionMock, userFindMock, verifyPasswordMock, verifyTotpMock, transactionMock, auditMock } = vi.hoisted(() => ({
  permissionMock: vi.fn(), userFindMock: vi.fn(), verifyPasswordMock: vi.fn(), verifyTotpMock: vi.fn(), transactionMock: vi.fn(), auditMock: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock, verifyPassword: verifyPasswordMock }))
vi.mock('@/lib/mfa', () => ({ verifyTotpCode: verifyTotpMock, decryptSecret: (s: string) => s }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: userFindMock, findMany: vi.fn(), count: vi.fn() }, $transaction: transactionMock,
} }))
import { PATCH } from './route'

const now = new Date('2026-08-31T07:00:00.000Z').toISOString()
const patch = (body: unknown, origin = 'https://shop.test') => PATCH(new NextRequest('https://shop.test/api/admin/users', {
  method: 'PATCH', body: JSON.stringify(body), headers: { origin },
}))

describe('PATCH /api/admin/users privilege boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue({ id: 'admin-1', platformRole: 'admin', email: 'admin@test.com' })
  })

  it('rejects cross-origin mutations before permission lookup', async () => {
    expect((await patch({ id: 'u1', expectedUpdatedAt: now, name: 'X' }, 'https://evil.test')).status).toBe(403)
    expect(permissionMock).not.toHaveBeenCalled()
  })

  it('prevents an admin from changing their own platform role', async () => {
    const response = await patch({ id: 'admin-1', expectedUpdatedAt: now, platformRole: 'customer', reason: 'self demotion' })
    expect(response.status).toBe(409)
    expect(userFindMock).not.toHaveBeenCalled()
  })

  it('requires reason, password and MFA for every role change', async () => {
    expect((await patch({ id: 'u1', expectedUpdatedAt: now, platformRole: 'admin' })).status).toBe(400)
    expect((await patch({ id: 'u1', expectedUpdatedAt: now, platformRole: 'admin', reason: 'promotion requested' })).status).toBe(401)
    expect(userFindMock).not.toHaveBeenCalled()
  })

  it('does not permit a limited manager to alter privilege fields', async () => {
    permissionMock.mockResolvedValue({ id: 'manager-1', platformRole: 'customer', teamRole: 'manager' })
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, teamRole: 'admin' })
    expect(response.status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('fails role-change step-up when either credential is invalid', async () => {
    userFindMock.mockResolvedValue({ passwordHash: 'hash', mfaEnabled: true, mfaSecret: 'secret' })
    verifyPasswordMock.mockResolvedValue(true)
    verifyTotpMock.mockResolvedValue(false)
    const response = await patch({
      id: 'u1', expectedUpdatedAt: now, platformRole: 'admin', reason: 'promotion requested',
      currentPassword: 'password', mfaCode: '123456',
    })
    expect(response.status).toBe(401)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('returns the permission response without parsing a mutation', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await patch({ id: 'u1' })).status).toBe(403)
  })

  it('requires the promotion target to have MFA enabled', async () => {
    userFindMock
      .mockResolvedValueOnce({ passwordHash: 'hash', mfaEnabled: true, mfaSecret: 'secret' })
      .mockResolvedValueOnce({ email: 'target@test.com', platformRole: 'customer', mfaEnabled: false, updatedAt: new Date(now) })
    verifyPasswordMock.mockResolvedValue(true)
    verifyTotpMock.mockResolvedValue(true)
    const response = await patch({
      id: 'u1', expectedUpdatedAt: now, platformRole: 'admin', reason: 'promotion requested',
      currentPassword: 'password', mfaCode: '123456',
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'target_mfa_required' })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('creates a pending approval without directly promoting the target', async () => {
    userFindMock
      .mockResolvedValueOnce({ passwordHash: 'hash', mfaEnabled: true, mfaSecret: 'secret' })
      .mockResolvedValueOnce({ email: 'target@test.com', platformRole: 'customer', mfaEnabled: true, updatedAt: new Date(now) })
    verifyPasswordMock.mockResolvedValue(true)
    verifyTotpMock.mockResolvedValue(true)
    const tx = {
      adminRoleChangeRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: 'approval-1', expiresAt: new Date('2026-09-01T07:00:00Z') }),
      },
    }
    transactionMock.mockImplementation((callback) => callback(tx))
    const response = await patch({
      id: 'u1', expectedUpdatedAt: now, platformRole: 'admin', reason: 'promotion requested',
      currentPassword: 'password', mfaCode: '123456',
    })
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ pendingApproval: true, requestId: 'approval-1' })
    expect(tx.adminRoleChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      targetUserId: 'u1', requestedByUserId: 'admin-1', requestedRole: 'admin',
    }) })
    expect(auditMock).toHaveBeenCalledOnce()
  })

  it('protects the last administrator from demotion', async () => {
    userFindMock.mockResolvedValue({ passwordHash: 'hash', mfaEnabled: true, mfaSecret: 'secret' })
    verifyPasswordMock.mockResolvedValue(true)
    verifyTotpMock.mockResolvedValue(true)
    const tx = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'admin-2', email: 'last@test.com', platformRole: 'admin', updatedAt: new Date(now),
        }),
        count: vi.fn().mockResolvedValue(1), updateMany: vi.fn(),
      },
    }
    transactionMock.mockImplementation((callback) => callback(tx))
    const response = await patch({
      id: 'admin-2', expectedUpdatedAt: now, platformRole: 'customer', reason: 'remove obsolete admin',
      currentPassword: 'password', mfaCode: '123456',
    })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'last_admin_protected' })
    expect(tx.user.updateMany).not.toHaveBeenCalled()
  })
})
