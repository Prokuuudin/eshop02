import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { invitationFindMock, userFindMock, rateLimitMock, transactionMock, hashPasswordMock, createSessionMock } = vi.hoisted(() => ({
  invitationFindMock: vi.fn(),
  userFindMock: vi.fn(),
  rateLimitMock: vi.fn(),
  transactionMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  createSessionMock: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    invitationToken: { findUnique: invitationFindMock },
    user: { findUnique: userFindMock },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock, createSession: createSessionMock, SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: rateLimitMock }))

import { GET, POST } from './route'

const future = new Date(Date.now() + 60_000)
const post = (body: Record<string, unknown>) => POST(new NextRequest('https://shop.test/api/auth/invite', {
  method: 'POST', body: JSON.stringify({ privacyAcknowledged: true, ...body }), headers: { 'cf-connecting-ip': '203.0.113.1' },
}))

describe('/api/auth/invite validation and abuse protection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rateLimitMock.mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
    hashPasswordMock.mockResolvedValue('new-hash')
    createSessionMock.mockResolvedValue('session-token')
  })

  it('rejects a missing token without querying storage', async () => {
    const response = await GET(new NextRequest('https://shop.test/api/auth/invite'))
    expect(response.status).toBe(400)
    expect(invitationFindMock).not.toHaveBeenCalled()
  })

  it('does not reveal details for an invalid token', async () => {
    invitationFindMock.mockResolvedValue(null)
    const response = await GET(new NextRequest('https://shop.test/api/auth/invite?token=bad'))
    expect(response.status).toBe(404)
    expect(await response.json()).toMatchObject({ ok: false, error: 'invalid_token' })
  })

  it('rate-limits before validating password or invitation state', async () => {
    rateLimitMock.mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(429)
    expect(invitationFindMock).not.toHaveBeenCalled()
  })

  it('rejects an already consumed invitation', async () => {
    invitationFindMock.mockResolvedValue({ status: 'accepted', expiresAt: future })
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(409)
    expect(userFindMock).not.toHaveBeenCalled()
  })

  it('atomically consumes an invitation and establishes a new session', async () => {
    const invitation = { status: 'sent', expiresAt: future, userId: 'u1', email: 'buyer@test.com', cardNumber: '1234567890' }
    invitationFindMock.mockResolvedValue(invitation)
    userFindMock.mockResolvedValue({ id: 'u1', name: 'Buyer', companyId: 'company-a', email: 'buyer@test.com', cardNumber: '1234567890' })
    const tx = {
      invitationToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { update: vi.fn().mockResolvedValue({ bonusPoints: 500 }) }, session: { deleteMany: vi.fn() },
      bonusTransaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      keyValueSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    }
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(200)
    expect(tx.invitationToken.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'sent' }) }))
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      passwordHash: 'new-hash',
      mustChangePassword: false,
      privacyNoticeVersion: '2026-07-03',
      privacyAcknowledgedAt: expect.any(Date),
    }) }))
    expect(response.cookies.get('eshop_session')?.value).toBe('session-token')
  })

  it('requires the privacy notice acknowledgement before touching the invitation', async () => {
    const response = await post({ token: 'token', password: 'valid-password', privacyAcknowledged: undefined })
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ ok: false, error: 'privacy_acknowledgement_required' })
    expect(invitationFindMock).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it.each([
    ['an expired', { status: 'sent', expiresAt: new Date(Date.now() - 1000) }, 410, 'token_expired'],
    ['an undelivered (error)', { status: 'error', expiresAt: future }, 404, 'invalid_token'],
    ['a revoked', { status: 'revoked', expiresAt: future }, 404, 'invalid_token'],
  ])('refuses %s invitation without creating a session', async (_label, invitation, status, error) => {
    invitationFindMock.mockResolvedValue({ userId: 'u1', email: 'buyer@test.com', cardNumber: '1234', ...invitation })
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(status)
    expect(await response.json()).toMatchObject({ ok: false, error })
    expect(transactionMock).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('grants the one-time welcome bonus on invitation acceptance', async () => {
    const invitation = { status: 'sent', expiresAt: future, userId: 'u1', email: 'buyer@test.com', cardNumber: '1234567890' }
    invitationFindMock.mockResolvedValue(invitation)
    userFindMock.mockResolvedValue({ id: 'u1', name: 'Buyer', companyId: 'company-a', email: 'buyer@test.com', cardNumber: '1234567890' })
    const tx = {
      invitationToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { update: vi.fn().mockResolvedValue({ bonusPoints: 500 }) }, session: { deleteMany: vi.fn() },
      bonusTransaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      keyValueSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    }
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const response = await post({ token: 'token', password: 'valid-password' })

    expect(response.status).toBe(200)
    expect(tx.bonusTransaction.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: 'u1', type: 'welcome', points: 500 }) })
    )
  })

  it('maps a concurrent consume loss to already_used and creates no session', async () => {
    invitationFindMock.mockResolvedValue({ status: 'sent', expiresAt: future, userId: 'u1', email: 'buyer@test.com', cardNumber: '1234567890' })
    userFindMock.mockResolvedValue({ id: 'u1', name: 'Buyer', companyId: 'company-a', email: 'buyer@test.com', cardNumber: '1234567890' })
    transactionMock.mockImplementation(async (fn) => fn({
      invitationToken: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    }))
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(409)
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it.each([
    ['platform admin', { platformRole: 'admin', teamRole: null, superAdmin: false }],
    ['Super Admin', { platformRole: 'admin', teamRole: null, superAdmin: true }],
    ['staff manager', { platformRole: 'customer', teamRole: 'manager', superAdmin: false }],
  ])('refuses to activate an invitation on a %s account: token, password, role and sessions untouched', async (_label, roles) => {
    invitationFindMock.mockResolvedValue({ status: 'sent', expiresAt: future, userId: 's1', email: 'staff@test.com', cardNumber: '1234' })
    userFindMock.mockResolvedValue({ id: 's1', name: 'Staff', companyId: null, mfaEnabled: true, ...roles })
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ ok: false, error: 'staff_account' })
    expect(hashPasswordMock).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
    expect(response.headers.get('set-cookie')).toBeNull()
  })

  it.each([
    ['the account email changed after the link was sent', { email: 'new-owner@test.com', cardNumber: '1234' }],
    ['the account card changed after the link was sent', { email: 'buyer@test.com', cardNumber: '5678' }],
  ])('refuses a stale invitation when %s: card and password stay untouched', async (_label, current) => {
    invitationFindMock.mockResolvedValue({ status: 'sent', expiresAt: future, userId: 'u1', email: 'buyer@test.com', cardNumber: '1234' })
    userFindMock.mockResolvedValue({ id: 'u1', name: 'Buyer', companyId: 'company-a', platformRole: 'customer', teamRole: null, superAdmin: false, ...current })
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(409)
    expect(await response.json()).toEqual({ ok: false, error: 'invitation_stale' })
    expect(hashPasswordMock).not.toHaveBeenCalled()
    expect(transactionMock).not.toHaveBeenCalled()
    expect(createSessionMock).not.toHaveBeenCalled()
  })

  it('keeps the account card instead of restoring the card stored in the invitation', async () => {
    invitationFindMock.mockResolvedValue({ status: 'sent', expiresAt: future, userId: 'u1', email: 'Buyer@Test.com', cardNumber: '01234' })
    userFindMock.mockResolvedValue({ id: 'u1', name: 'Buyer', companyId: 'company-a', email: 'buyer@test.com', cardNumber: '1234' })
    const tx = {
      invitationToken: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      user: { update: vi.fn().mockResolvedValue({ bonusPoints: 500 }) }, session: { deleteMany: vi.fn() },
      bonusTransaction: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
      keyValueSetting: { findUnique: vi.fn().mockResolvedValue(null) },
    }
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const response = await post({ token: 'token', password: 'valid-password' })
    expect(response.status).toBe(200)
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cardNumber: '1234' }) }))
  })
})
