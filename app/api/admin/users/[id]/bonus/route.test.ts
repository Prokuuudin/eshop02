import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const { permissionMock, transactionMock, auditMock, expireMock, consumeMock, expiryDaysMock } = vi.hoisted(() => ({
  permissionMock: vi.fn(), transactionMock: vi.fn(), auditMock: vi.fn(), expireMock: vi.fn(),
  consumeMock: vi.fn(), expiryDaysMock: vi.fn(),
}))

vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: permissionMock }))
vi.mock('@/lib/prisma', () => ({ prisma: { $transaction: transactionMock } }))
vi.mock('@/lib/server-audit', () => ({ appendServerAudit: auditMock }))
vi.mock('@/lib/bonus-ledger', () => ({
  expireBonusPoints: expireMock,
  consumeBonusLots: consumeMock,
  getBonusExpiryDays: expiryDaysMock,
  bonusExpiryDate: () => new Date('2027-08-31T00:00:00Z'),
}))

import { POST } from './route'

const request = (body: unknown) => new NextRequest('https://shop.test/api/admin/users/u1/bonus', {
  method: 'POST', body: JSON.stringify(body), headers: { origin: 'https://shop.test' },
})
const context = { params: Promise.resolve({ id: 'u1' }) }

describe('POST /api/admin/users/:id/bonus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    permissionMock.mockResolvedValue({ id: 'admin-1', email: 'admin@test.com', platformRole: 'admin' })
    expiryDaysMock.mockResolvedValue(365)
  })

  it('returns the permission gate before opening a transaction', async () => {
    permissionMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await POST(request({ delta: 10, reason: 'manual correction' }), context)).status).toBe(403)
    expect(transactionMock).not.toHaveBeenCalled()
  })

  it('locks the user before reading and changing the bonus balance', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'u1' }]),
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'buyer@test.com', bonusPoints: 100 }),
        update: vi.fn().mockResolvedValue({ id: 'u1', bonusPoints: 125 }),
      },
      bonusTransaction: { create: vi.fn().mockResolvedValue({}) },
    }
    transactionMock.mockImplementation((callback) => callback(tx))
    const response = await POST(request({ delta: 25, reason: 'service recovery' }), context)
    expect(response.status).toBe(200)
    expect(tx.$queryRaw).toHaveBeenCalledOnce()
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(expireMock.mock.invocationCallOrder[0])
    expect(tx.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { bonusPoints: 125 } }))
    expect(tx.bonusTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      points: 25, balanceAfter: 125, actorUserId: 'admin-1',
    }) })
    expect(auditMock).toHaveBeenCalledOnce()
  })

  it('clamps a debit at zero and consumes only the actual available points', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'u1' }]),
      user: {
        findUnique: vi.fn().mockResolvedValue({ email: 'buyer@test.com', bonusPoints: 20 }),
        update: vi.fn().mockResolvedValue({ id: 'u1', bonusPoints: 0 }),
      },
      bonusTransaction: { create: vi.fn().mockResolvedValue({}) },
    }
    transactionMock.mockImplementation((callback) => callback(tx))
    const response = await POST(request({ delta: -100, reason: 'reverse invalid credit' }), context)
    expect(response.status).toBe(200)
    expect(consumeMock).toHaveBeenCalledWith(tx, 'u1', 20)
    expect(tx.bonusTransaction.create).toHaveBeenCalledWith({ data: expect.objectContaining({ points: -20, balanceAfter: 0 }) })
  })

  it('does not create a ledger or audit entry for an unknown user', async () => {
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([]),
      user: { findUnique: vi.fn().mockResolvedValue(null), update: vi.fn() },
      bonusTransaction: { create: vi.fn() },
    }
    transactionMock.mockImplementation((callback) => callback(tx))
    const response = await POST(request({ delta: 10, reason: 'manual correction' }), context)
    expect(response.status).toBe(404)
    expect(tx.bonusTransaction.create).not.toHaveBeenCalled()
    expect(auditMock).not.toHaveBeenCalled()
  })
})
