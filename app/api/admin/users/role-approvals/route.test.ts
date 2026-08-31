import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { permissionMock, verifyPasswordMock, verifyTotpMock, userFindMock, transactionMock, auditMock } = vi.hoisted(() => ({
  permissionMock: vi.fn(), verifyPasswordMock: vi.fn(), verifyTotpMock: vi.fn(), userFindMock: vi.fn(), transactionMock: vi.fn(), auditMock: vi.fn(),
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock, verifyPassword: verifyPasswordMock }))
vi.mock('@/lib/mfa', () => ({ verifyTotpCode: verifyTotpMock, decryptSecret: (value: string) => value }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/prisma', () => ({ prisma: {
  user: { findUnique: userFindMock }, adminRoleChangeRequest: { findMany: vi.fn() }, $transaction: transactionMock,
} }))

import { POST } from './route'

const request = (body: unknown, origin = 'https://shop.test') => new NextRequest('https://shop.test/api/admin/users/role-approvals', {
  method: 'POST', body: JSON.stringify(body), headers: { origin },
})
const validBody = { requestId: 'r1', currentPassword: 'password', mfaCode: '123456', reason: 'Approved by second admin' }

describe('POST /api/admin/users/role-approvals', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue({ id: 'admin-2', platformRole: 'admin' })
    userFindMock.mockResolvedValue({ passwordHash: 'hash', mfaEnabled: true, mfaSecret: 'secret' })
    verifyPasswordMock.mockResolvedValue(true)
    verifyTotpMock.mockResolvedValue(true)
  })

  it('rejects cross-origin approval before checking permissions', async () => {
    expect((await POST(request(validBody, 'https://evil.test'))).status).toBe(403)
    expect(permissionMock).not.toHaveBeenCalled()
  })

  it('requires both password and MFA step-up authentication', async () => {
    verifyTotpMock.mockResolvedValue(false)
    expect((await POST(request(validBody))).status).toBe(401)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('enforces four-eyes approval inside the transaction', async () => {
    transactionMock.mockImplementation(async (fn) => fn({
      adminRoleChangeRequest: { findUnique: vi.fn().mockResolvedValue({
        id: 'r1', status: 'pending', expiresAt: new Date(Date.now() + 60_000), requestedByUserId: 'admin-2',
      }) },
    }))
    const response = await POST(request(validBody))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'four_eyes_required' })
  })

  it('returns the permission gate response without reading credentials', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await POST(request(validBody))).status).toBe(403)
    expect(userFindMock).not.toHaveBeenCalled()
  })

  it('rechecks target MFA before approving a pending promotion', async () => {
    const tx = {
      adminRoleChangeRequest: { findUnique: vi.fn().mockResolvedValue({
        id: 'r1', status: 'pending', expiresAt: new Date(Date.now() + 60_000),
        requestedByUserId: 'admin-1', targetUserId: 'u1', expectedUpdatedAt: new Date('2026-08-31T07:00:00Z'),
      }) },
      user: { findUnique: vi.fn().mockResolvedValue({ id: 'u1', mfaEnabled: false }) },
    }
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const response = await POST(request(validBody))
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'target_mfa_required' })
    expect(auditMock).not.toHaveBeenCalled()
  })

  it('promotes after independent approval and revokes existing sessions', async () => {
    const expectedUpdatedAt = new Date('2026-08-31T07:00:00Z')
    const tx = {
      adminRoleChangeRequest: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'r1', status: 'pending', expiresAt: new Date(Date.now() + 60_000),
          requestedByUserId: 'admin-1', targetUserId: 'u1', expectedUpdatedAt,
        }),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'u1', email: 'target@test.com', platformRole: 'customer', mfaEnabled: true, updatedAt: expectedUpdatedAt,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      session: { deleteMany: vi.fn().mockResolvedValue({ count: 2 }) },
    }
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const response = await POST(request(validBody))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ approved: true, userId: 'u1' })
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', updatedAt: expectedUpdatedAt }, data: { platformRole: 'admin' },
    })
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    expect(tx.adminRoleChangeRequest.update).toHaveBeenCalledWith({
      where: { id: 'r1' }, data: expect.objectContaining({ status: 'approved', approvedByUserId: 'admin-2' }),
    })
    expect(auditMock).toHaveBeenCalledOnce()
  })
})
