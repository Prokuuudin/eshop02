import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { tx } = vi.hoisted(() => ({
  tx: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    session: { deleteMany: vi.fn() },
    mfaChallenge: { deleteMany: vi.fn() },
  },
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
  },
}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: vi.fn(), verifyPassword: vi.fn() }))
vi.mock('@/lib/mfa', () => ({ decryptSecret: vi.fn(() => 'RAWSECRET'), verifyTotpCode: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: vi.fn() }))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))

import { prisma } from '@/lib/prisma'
import { requireAdminPermission, verifyPassword } from '@/lib/server-auth'
import { verifyTotpCode } from '@/lib/mfa'
import { checkRateLimit } from '@/lib/rate-limit'
import { appendServerAudit } from '@/lib/server-audit'
import { POST } from './route'

const actor = { id: 'admin1', email: 'boss@x.lv', platformRole: 'admin' }
const body = { currentPassword: 'pw', mfaCode: '123456', reason: 'Lost phone and recovery codes' }

function call(id: string, payload: Record<string, unknown> = body) {
  const req = new NextRequest(`http://localhost/api/admin/users/${id}/mfa-reset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'http://localhost' },
    body: JSON.stringify(payload),
  })
  return POST(req, { params: Promise.resolve({ id }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(requireAdminPermission).mockResolvedValue(actor as never)
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  vi.mocked(prisma.user.findUnique).mockResolvedValue({ passwordHash: 'h', mfaEnabled: true, mfaSecret: 'enc' } as never)
  vi.mocked(verifyPassword).mockResolvedValue(true)
  vi.mocked(verifyTotpCode).mockResolvedValue(true)
  tx.user.findUnique.mockResolvedValue({ email: 'staff@x.lv', mfaEnabled: true, mfaEnrolledAt: new Date('2026-09-01') })
})

describe('POST /api/admin/users/[id]/mfa-reset', () => {
  it('requires users.manage', async () => {
    vi.mocked(requireAdminPermission).mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await call('staff1')
    expect(res.status).toBe(403)
    expect(requireAdminPermission).toHaveBeenCalledWith('users.manage')
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('refuses to reset the caller themselves (no self-service bypass of step-up)', async () => {
    const res = await call('admin1')
    expect(res.status).toBe(409)
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('requires the actor password and the actor TOTP code', async () => {
    vi.mocked(verifyTotpCode).mockResolvedValue(false)
    expect((await call('staff1')).status).toBe(401)
    vi.mocked(verifyTotpCode).mockResolvedValue(true)
    vi.mocked(verifyPassword).mockResolvedValue(false)
    expect((await call('staff1')).status).toBe(401)
    expect(tx.user.update).not.toHaveBeenCalled()
  })

  it('rejects a missing reason', async () => {
    const res = await call('staff1', { currentPassword: 'pw', mfaCode: '123456' })
    expect(res.status).toBe(400)
  })

  it('is rate limited per actor', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await call('staff1')
    expect(res.status).toBe(429)
    expect(verifyPassword).not.toHaveBeenCalled()
  })

  it('clears MFA, revokes sessions and challenges, and writes an audit record', async () => {
    const res = await call('staff1')

    expect(res.status).toBe(200)
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'staff1' },
      data: { mfaEnabled: false, mfaSecret: null, mfaBackupCodes: [], mfaEnrolledAt: null },
    })
    expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: 'staff1' } })
    expect(tx.mfaChallenge.deleteMany).toHaveBeenCalledWith({ where: { userId: 'staff1' } })
    expect(appendServerAudit).toHaveBeenCalledWith(tx, expect.anything(), actor, expect.objectContaining({
      action: 'user.mfa_reset', entityId: 'staff1', reason: body.reason,
    }))
  })

  it('returns 404 for an unknown user', async () => {
    tx.user.findUnique.mockResolvedValue(null)
    const res = await call('nobody')
    expect(res.status).toBe(404)
    expect(tx.user.update).not.toHaveBeenCalled()
  })
})
