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
const SUPER_ADMIN = { id: 'admin-1', platformRole: 'admin', superAdmin: true, email: 'super@test.com' }
const REGULAR_ADMIN = { id: 'admin-3', platformRole: 'admin', superAdmin: false, email: 'admin@test.com' }
const CUSTOMER_TARGET = { platformRole: 'customer', teamRole: null, superAdmin: false }
const ADMIN_TARGET = { platformRole: 'admin', teamRole: null, superAdmin: false }
const SUPER_TARGET = { platformRole: 'admin', teamRole: null, superAdmin: true }
const CREDENTIALS = { passwordHash: 'hash', mfaEnabled: true, mfaSecret: 'secret' }
const STEP_UP = { reason: 'approved staff change', currentPassword: 'password', mfaCode: '123456' }

/** A transaction whose locked row is `before`; updateMany applies `data` onto it. */
function txFor(before: Record<string, unknown>, superAdminCount = 1) {
  let after = before
  const tx = {
    user: {
      findUnique: vi.fn().mockImplementation(async () => before),
      findUniqueOrThrow: vi.fn().mockImplementation(async () => after),
      updateMany: vi.fn().mockImplementation(async ({ data }) => { after = { ...before, ...data }; return { count: 1 } }),
      count: vi.fn().mockImplementation(async ({ where }) => (where.superAdmin ? superAdminCount : 2)),
    },
    session: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    invitationToken: { deleteMany: vi.fn().mockResolvedValue({ count: 1 }) },
    passwordResetToken: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
  }
  transactionMock.mockImplementation((callback) => callback(tx))
  return tx
}
const row = (fields: Record<string, unknown>) => ({
  id: 'u1', email: 'target@test.com', companyId: null, approvalRequired: false, auditLoggingEnabled: false,
  mustChangePassword: false, cardNumber: null, updatedAt: new Date(now), ...fields,
})

describe('PATCH /api/admin/users privilege boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue(SUPER_ADMIN)
    verifyPasswordMock.mockResolvedValue(true)
    verifyTotpMock.mockResolvedValue(true)
  })

  it('rejects cross-origin mutations before permission lookup', async () => {
    expect((await patch({ id: 'u1', expectedUpdatedAt: now, name: 'X' }, 'https://evil.test')).status).toBe(403)
    expect(permissionMock).not.toHaveBeenCalled()
  })

  it('prevents an admin from changing their own platform role or Super Admin flag', async () => {
    expect((await patch({ id: 'admin-1', expectedUpdatedAt: now, platformRole: 'customer', reason: 'self demotion' })).status).toBe(409)
    expect((await patch({ id: 'admin-1', expectedUpdatedAt: now, superAdmin: false, ...STEP_UP })).status).toBe(409)
    permissionMock.mockResolvedValue(REGULAR_ADMIN)
    expect((await patch({ id: 'admin-3', expectedUpdatedAt: now, superAdmin: true, ...STEP_UP })).status).toBe(409)
    expect(userFindMock).not.toHaveBeenCalled()
  })

  it('requires reason, password and MFA for every role change', async () => {
    userFindMock.mockResolvedValue(CUSTOMER_TARGET)
    expect((await patch({ id: 'u1', expectedUpdatedAt: now, platformRole: 'admin' })).status).toBe(400)
    expect((await patch({ id: 'u1', expectedUpdatedAt: now, platformRole: 'admin', reason: 'promotion requested' })).status).toBe(401)
    expect(verifyPasswordMock).not.toHaveBeenCalled()
  })

  it('does not permit a limited manager to alter privilege fields', async () => {
    permissionMock.mockResolvedValue({ id: 'manager-1', platformRole: 'customer', teamRole: 'manager' })
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, teamRole: 'admin' })
    expect(response.status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it.each([
    ['promote a customer to admin', CUSTOMER_TARGET, { platformRole: 'admin' }],
    ['demote an admin', ADMIN_TARGET, { platformRole: 'customer' }],
    ['grant Super Admin', ADMIN_TARGET, { superAdmin: true }],
    ['grant the staff manager role', CUSTOMER_TARGET, { teamRole: 'manager' }],
    ['change another admin\'s email', ADMIN_TARGET, { email: 'attacker@evil.test' }],
    ['change a Super Admin\'s name', SUPER_TARGET, { name: 'Renamed' }],
    ['attach a client card to another admin', ADMIN_TARGET, { cardNumber: '4321' }],
    ['revoke the staff manager role', { ...CUSTOMER_TARGET, teamRole: 'manager' }, { teamRole: null }],
  ])('a regular admin cannot %s', async (_label, target, changes) => {
    permissionMock.mockResolvedValue(REGULAR_ADMIN)
    userFindMock.mockResolvedValueOnce(target)
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, ...changes, ...STEP_UP })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'super_admin_required' })
    expect(verifyPasswordMock).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('still lets a regular admin edit a customer without step-up (shop operations unchanged)', async () => {
    permissionMock.mockResolvedValue(REGULAR_ADMIN)
    userFindMock.mockResolvedValueOnce(CUSTOMER_TARGET)
    const tx = txFor(row({ ...CUSTOMER_TARGET, name: 'Old' }))
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, name: 'New name' })
    expect(response.status).toBe(200)
    expect(verifyPasswordMock).not.toHaveBeenCalled()
    expect(tx.session.deleteMany).not.toHaveBeenCalled()
    expect(tx.invitationToken.deleteMany).not.toHaveBeenCalled()
    expect(tx.passwordResetToken.deleteMany).not.toHaveBeenCalled()
  })

  it('revokes pending invitation and reset links when a customer email is corrected', async () => {
    permissionMock.mockResolvedValue(REGULAR_ADMIN)
    userFindMock.mockResolvedValueOnce(CUSTOMER_TARGET)
    const tx = txFor(row({ ...CUSTOMER_TARGET, email: 'buyer@gamil.com', cardNumber: '111' }))
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, email: 'buyer@gmail.com' })
    expect(response.status).toBe(200)
    expect(tx.invitationToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1', status: { not: 'accepted' } } })
    expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
  })

  it('refuses when the target became staff after the pre-check', async () => {
    permissionMock.mockResolvedValue(REGULAR_ADMIN)
    userFindMock.mockResolvedValueOnce(CUSTOMER_TARGET)
    const tx = txFor(row(ADMIN_TARGET))
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, email: 'attacker@evil.test' })
    expect(response.status).toBe(401)
    expect(tx.user.updateMany).not.toHaveBeenCalled()
  })

  it('fails role-change step-up when either credential is invalid', async () => {
    userFindMock.mockResolvedValueOnce(CUSTOMER_TARGET).mockResolvedValueOnce(CREDENTIALS)
    verifyTotpMock.mockResolvedValue(false)
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, platformRole: 'admin', ...STEP_UP })
    expect(response.status).toBe(401)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('returns the permission response without parsing a mutation', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await patch({ id: 'u1' })).status).toBe(403)
  })

  it('lets a Super Admin propose a customer without MFA for admin (pending four-eyes approval)', async () => {
    userFindMock
      .mockResolvedValueOnce(CUSTOMER_TARGET)
      .mockResolvedValueOnce(CREDENTIALS)
      .mockResolvedValueOnce({ email: 'target@test.com', platformRole: 'customer', updatedAt: new Date(now) })
    const tx = {
      adminRoleChangeRequest: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create: vi.fn().mockResolvedValue({ id: 'approval-1', expiresAt: new Date('2026-09-01T07:00:00Z') }),
      },
    }
    transactionMock.mockImplementation((callback) => callback(tx))
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, platformRole: 'admin', ...STEP_UP })
    expect(response.status).toBe(202)
    expect(await response.json()).toMatchObject({ pendingApproval: true, requestId: 'approval-1' })
    expect(tx.adminRoleChangeRequest.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      targetUserId: 'u1', requestedByUserId: 'admin-1', requestedRole: 'admin',
    }) })
    expect(auditMock).toHaveBeenCalledOnce()
  })

  it('refuses Super Admin for a non-admin target', async () => {
    userFindMock.mockResolvedValueOnce(CUSTOMER_TARGET)
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, superAdmin: true, ...STEP_UP })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'super_admin_requires_admin' })
  })

  it('grants Super Admin with step-up, revokes the target sessions and audits the flag', async () => {
    userFindMock.mockResolvedValueOnce(ADMIN_TARGET).mockResolvedValueOnce(CREDENTIALS)
    const tx = txFor(row(ADMIN_TARGET))
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, superAdmin: true, ...STEP_UP })
    expect(response.status).toBe(200)
    expect((await response.json()).user).toMatchObject({ superAdmin: true })
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    expect(auditMock).toHaveBeenCalledWith(tx, expect.anything(), SUPER_ADMIN, expect.objectContaining({
      action: 'user.privileges_changed', before: expect.objectContaining({ superAdmin: false }),
      after: expect.objectContaining({ superAdmin: true }), reason: 'approved staff change',
    }))
  })

  it('protects the last Super Admin', async () => {
    userFindMock.mockResolvedValueOnce(SUPER_TARGET).mockResolvedValueOnce(CREDENTIALS)
    txFor(row(SUPER_TARGET), 0)
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, superAdmin: false, ...STEP_UP })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'last_super_admin_protected' })
  })

  it('drops the Super Admin flag when a Super Admin is demoted to customer', async () => {
    userFindMock.mockResolvedValueOnce(SUPER_TARGET).mockResolvedValueOnce(CREDENTIALS)
    const tx = txFor(row(SUPER_TARGET), 1)
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, platformRole: 'customer', ...STEP_UP })
    expect(response.status).toBe(200)
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { platformRole: 'customer', superAdmin: false } }))
  })

  it('protects the last administrator from demotion', async () => {
    userFindMock.mockResolvedValueOnce(ADMIN_TARGET).mockResolvedValueOnce(CREDENTIALS)
    const tx = txFor(row(ADMIN_TARGET))
    tx.user.count.mockResolvedValue(1)
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, platformRole: 'customer', ...STEP_UP })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ error: 'last_admin_protected' })
    expect(tx.user.updateMany).not.toHaveBeenCalled()
  })
})

describe('PATCH /api/admin/users from Clients → all card holders', () => {
  const MANAGER = { id: 'manager-1', platformRole: 'customer', teamRole: 'manager', superAdmin: false, email: 'manager@test.com' }
  // Exactly what useAdminClientBarcodesPage sends for an individual → company switch.
  const CLIENT_SAVE = {
    expectedUpdatedAt: now, name: 'SIA Salons', email: 'salons@example.com', phone: '+37122222222',
    customerType: 'company', registrationNumber: '40003000001',
  }
  const CARD_CUSTOMER = row({
    ...CUSTOMER_TARGET, cardNumber: '5070', name: 'Anna Ozola', phone: '+37111111111', companyName: null,
    customerType: 'individual', registrationNumber: null, vatNumber: null, legalAddress: null,
    checkoutProfile: { customerType: 'individual', firstName: 'Anna', lastName: 'Ozola', companyName: '', regNumber: '', phone: '+37111111111', address: 'Brīvības 1' },
  })
  const STAFF_MANAGER_CARD = row({ ...CARD_CUSTOMER, teamRole: 'manager' })

  beforeEach(() => {
    vi.clearAllMocks()
    verifyPasswordMock.mockResolvedValue(true)
    verifyTotpMock.mockResolvedValue(true)
  })

  it.each([
    ['Super Admin', SUPER_ADMIN],
    ['regular admin', REGULAR_ADMIN],
    ['manager', MANAGER],
  ])('a %s saves an ordinary card holder without step-up, profile included', async (_label, caller) => {
    permissionMock.mockResolvedValue(caller)
    userFindMock.mockResolvedValueOnce(CUSTOMER_TARGET)
    const tx = txFor(CARD_CUSTOMER)
    const response = await patch({ id: 'u1', ...CLIENT_SAVE })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ user: { customerType: 'company', registrationNumber: '40003000001', email: 'salons@example.com' } })
    expect(verifyPasswordMock).not.toHaveBeenCalled()
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: 'u1', updatedAt: new Date(now) },
      data: expect.objectContaining({
        name: 'SIA Salons', email: 'salons@example.com', phone: '+37122222222', customerType: 'company', registrationNumber: '40003000001',
        // The admin list reads the checkout profile first: without this the switch reverted on reload.
        checkoutProfile: expect.objectContaining({ customerType: 'company', companyName: 'SIA Salons', regNumber: '40003000001', phone: '+37122222222', address: 'Brīvības 1' }),
      }),
    })
  })

  it('a manager cannot edit fields beyond customer details', async () => {
    permissionMock.mockResolvedValue(MANAGER)
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, cardNumber: '9999' })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
  })

  it('a manager cannot edit an account without a client card', async () => {
    permissionMock.mockResolvedValue(MANAGER)
    userFindMock.mockResolvedValueOnce(CUSTOMER_TARGET)
    const tx = txFor(row({ ...CARD_CUSTOMER, cardNumber: null }))
    const response = await patch({ id: 'u1', ...CLIENT_SAVE })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'forbidden' })
    expect(tx.user.updateMany).not.toHaveBeenCalled()
  })

  it.each([
    ['regular admin', REGULAR_ADMIN],
    ['manager', MANAGER],
  ])('a %s cannot edit a card holder who is staff', async (_label, caller) => {
    permissionMock.mockResolvedValue(caller)
    userFindMock.mockResolvedValueOnce({ ...CUSTOMER_TARGET, teamRole: 'manager' })
    const response = await patch({ id: 'u1', ...CLIENT_SAVE, ...STEP_UP })
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ error: 'super_admin_required' })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('a Super Admin editing a staff card holder must give a reason, then password and MFA', async () => {
    permissionMock.mockResolvedValue(SUPER_ADMIN)
    userFindMock.mockResolvedValue({ ...CUSTOMER_TARGET, teamRole: 'manager' })
    const noReason = await patch({ id: 'u1', ...CLIENT_SAVE })
    expect(noReason.status).toBe(400)
    expect(await noReason.json()).toEqual({ error: 'change_reason_required' })
    const noCredentials = await patch({ id: 'u1', ...CLIENT_SAVE, reason: STEP_UP.reason })
    expect(noCredentials.status).toBe(401)
    expect(await noCredentials.json()).toEqual({ error: 'reauthentication_required' })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('a Super Admin with a wrong password or code gets reauthentication_failed', async () => {
    permissionMock.mockResolvedValue(SUPER_ADMIN)
    userFindMock.mockResolvedValueOnce({ ...CUSTOMER_TARGET, teamRole: 'manager' }).mockResolvedValueOnce(CREDENTIALS)
    verifyPasswordMock.mockResolvedValue(false)
    const response = await patch({ id: 'u1', ...CLIENT_SAVE, ...STEP_UP })
    expect(response.status).toBe(401)
    expect(await response.json()).toEqual({ error: 'reauthentication_failed' })
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('a Super Admin saves a staff card holder after step-up and the reason is audited', async () => {
    permissionMock.mockResolvedValue(SUPER_ADMIN)
    userFindMock.mockResolvedValueOnce({ ...CUSTOMER_TARGET, teamRole: 'manager' }).mockResolvedValueOnce(CREDENTIALS)
    const tx = txFor(STAFF_MANAGER_CARD)
    const response = await patch({ id: 'u1', ...CLIENT_SAVE, ...STEP_UP })
    expect(response.status).toBe(200)
    expect(verifyPasswordMock).toHaveBeenCalledWith('password', 'hash')
    expect(verifyTotpMock).toHaveBeenCalledWith('secret', '123456')
    expect(tx.user.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ customerType: 'company' }) }))
    // Step-up fields are never written to the account.
    expect(tx.user.updateMany.mock.calls[0][0].data).not.toHaveProperty('currentPassword')
    expect(auditMock).toHaveBeenCalledWith(tx, expect.anything(), SUPER_ADMIN, expect.objectContaining({ reason: STEP_UP.reason }))
  })

  it('leaves the checkout profile untouched for an email-only correction', async () => {
    permissionMock.mockResolvedValue(SUPER_ADMIN)
    userFindMock.mockResolvedValueOnce(CUSTOMER_TARGET)
    const tx = txFor(CARD_CUSTOMER)
    const response = await patch({ id: 'u1', expectedUpdatedAt: now, email: 'anna@example.com' })
    expect(response.status).toBe(200)
    expect(tx.user.updateMany.mock.calls[0][0].data).toEqual({ email: 'anna@example.com' })
  })
})
