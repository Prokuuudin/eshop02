import { createHash } from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mocks = vi.hoisted(() => ({
  requireAdminPermission: vi.fn(),
  hashPassword: vi.fn(),
  userFindFirst: vi.fn(),
  transaction: vi.fn(),
  deliveryUpdate: vi.fn(),
  sendEmail: vi.fn(),
  appendAudit: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({
  requireAdminPermission: mocks.requireAdminPermission,
  hashPassword: mocks.hashPassword,
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    $transaction: mocks.transaction,
    invitationDelivery: { update: mocks.deliveryUpdate },
  },
}))
vi.mock('@/lib/mailer', () => ({ sendEmail: mocks.sendEmail }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: mocks.appendAudit }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: () => 'https://shop.test' }))

import { POST } from './route'

const actor = {
  id: 'admin-1',
  email: 'admin@test.com',
  name: 'Admin',
  platformRole: 'admin',
  teamRole: null,
}

const candidate = {
  id: 'staff-1',
  email: 'staff@test.com',
  name: 'Staff',
  platformRole: 'customer',
  companyId: null,
  companyName: null,
  teamRole: null,
  cardNumber: null,
  mustChangePassword: true,
  mfaEnabled: false,
}

function request(overrides: Record<string, unknown> = {}, origin = 'http://localhost'): NextRequest {
  return new NextRequest('http://localhost/api/admin/staff-invitations', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({
      email: 'staff@test.com',
      name: 'Staff',
      language: 'en',
      reason: 'Chief administrator appointment',
      ...overrides,
    }),
  })
}

function makeTx({ existing = false }: { existing?: boolean } = {}) {
  return {
    user: {
      findUnique: vi.fn(async (_args: unknown) => candidate),
      create: vi.fn(async (_args: unknown) => candidate),
    },
    passwordResetToken: {
      deleteMany: vi.fn(async () => ({ count: 1 })),
      create: vi.fn(async () => ({ id: 'token-row' })),
    },
    invitationDelivery: {
      findFirst: vi.fn(async () => existing ? { status: 'sent' } : null),
      create: vi.fn(async () => ({ id: 'delivery-1' })),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.requireAdminPermission.mockResolvedValue(actor)
  mocks.hashPassword.mockResolvedValue('unguessable-temporary-hash')
  mocks.userFindFirst.mockResolvedValue(null)
  mocks.deliveryUpdate.mockResolvedValue({ id: 'delivery-1' })
  mocks.sendEmail.mockResolvedValue(undefined)
})

describe('POST /api/admin/staff-invitations', () => {
  it('rejects a cross-origin mutation before authorization or data access', async () => {
    const response = await POST(request({}, 'https://attacker.test'))

    expect(response.status).toBe(403)
    expect(mocks.requireAdminPermission).not.toHaveBeenCalled()
    expect(mocks.userFindFirst).not.toHaveBeenCalled()
  })

  it('requires users.manage (and therefore the MFA-verified admin session gate)', async () => {
    mocks.requireAdminPermission.mockResolvedValue(
      NextResponse.json({ error: 'forbidden' }, { status: 403 }),
    )

    const response = await POST(request())

    expect(response.status).toBe(403)
    expect(mocks.requireAdminPermission).toHaveBeenCalledWith('users.manage')
    expect(mocks.userFindFirst).not.toHaveBeenCalled()
  })

  it('creates an inert account and emails a one-time token without returning it', async () => {
    const tx = makeTx()
    mocks.transaction.mockImplementation(async (callback) => callback(tx))

    const response = await POST(request())
    const result = await response.json()

    expect(response.status).toBe(201)
    expect(result).toMatchObject({ ok: true, userId: 'staff-1', reinvited: false })
    expect(JSON.stringify(result)).not.toContain('token=')
    const created = (tx.user.create.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data
    expect(created).toMatchObject({
      platformRole: 'customer',
      companyId: null,
      companyName: null,
      teamRole: null,
      cardNumber: null,
      bonusPoints: 0,
      mustChangePassword: true,
    })
    expect(created.passwordHash).toBe('unguessable-temporary-hash')
    const html = mocks.sendEmail.mock.calls[0][2] as string
    const rawToken = html.match(/token=([a-f0-9]{64})/)?.[1]
    expect(rawToken).toBeTruthy()
    expect(tx.passwordResetToken.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tokenHash: createHash('sha256').update(rawToken!).digest('hex'),
        userId: 'staff-1',
      }),
    })
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      tx,
      expect.any(NextRequest),
      actor,
      expect.objectContaining({ action: 'user.staff_invitation_created' }),
    )
  })

  it('does not repurpose an existing account', async () => {
    mocks.userFindFirst.mockResolvedValue({
      ...candidate,
      mustChangePassword: false,
      invitationDeliveries: [],
    })

    const response = await POST(request())

    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ error: 'account_exists' })
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.sendEmail).not.toHaveBeenCalled()
  })

  it('reissues only a still-inert staff invitation and invalidates the old token', async () => {
    mocks.userFindFirst.mockResolvedValue({
      ...candidate,
      invitationDeliveries: [{ status: 'sent' }],
    })
    const tx = makeTx({ existing: true })
    mocks.transaction.mockImplementation(async (callback) => callback(tx))

    const response = await POST(request())

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ ok: true, reinvited: true })
    expect(tx.user.create).not.toHaveBeenCalled()
    expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'staff-1' } })
    expect(mocks.appendAudit).toHaveBeenCalledWith(
      tx,
      expect.any(NextRequest),
      actor,
      expect.objectContaining({ action: 'user.staff_invitation_resent' }),
    )
  })

  it('records a delivery error without exposing the activation link', async () => {
    const tx = makeTx()
    mocks.transaction.mockImplementation(async (callback) => callback(tx))
    mocks.sendEmail.mockRejectedValue(new Error('smtp unavailable'))

    const response = await POST(request())
    const result = await response.json()

    expect(response.status).toBe(502)
    expect(result).toEqual({ ok: false, error: 'email_send_failed' })
    expect(mocks.deliveryUpdate).toHaveBeenCalledWith({
      where: { id: 'delivery-1' },
      data: { status: 'error' },
    })
  })
})
