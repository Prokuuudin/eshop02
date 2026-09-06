import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const { userFindFirstMock, userUpdateMock, userCreateMock, hashPasswordMock, requireAdminMock } = vi.hoisted(() => ({
  userFindFirstMock: vi.fn(),
  userUpdateMock: vi.fn(),
  userCreateMock: vi.fn(),
  hashPasswordMock: vi.fn(),
  requireAdminMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findFirst: userFindFirstMock,
      update: userUpdateMock,
      create: userCreateMock,
    },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock,
  requireAdmin: requireAdminMock,
}))

import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/admin/invitations/card', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  requireAdminMock.mockResolvedValue({ id: 'admin-1', email: 'admin@hairshoppro.lv' })
  hashPasswordMock.mockResolvedValue('hashed')
  userFindFirstMock.mockResolvedValue(null)
  userCreateMock.mockImplementation(async ({ data }) => ({ id: data.id }))
  userUpdateMock.mockImplementation(async ({ where }) => ({ id: where.id }))
})

describe('POST /api/admin/invitations/card', () => {
  it('assigns a card to an already-registered client without touching name/phone', async () => {
    userFindFirstMock.mockResolvedValue({ id: 'user-1' })
    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1001', phone: '+37120000000' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, userId: 'user-1', created: false })
    expect(userUpdateMock).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { cardNumber: '1001' } })
    expect(userCreateMock).not.toHaveBeenCalled()
  })

  it('creates a sleeping account for a brand-new client with email, phone and card', async () => {
    const res = await POST(makeRequest({ email: 'New@Client.lv', cardNumber: '01002', name: 'Anna', phone: '+37120000001' }))

    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json).toEqual({ ok: true, userId: expect.any(String), created: true })
    const createArgs = userCreateMock.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(createArgs.data.email).toBe('new@client.lv')
    expect(createArgs.data.cardNumber).toBe('1002')
    expect(createArgs.data.phone).toBe('+37120000001')
    expect(createArgs.data.name).toBe('Anna')
    expect(createArgs.data.mustChangePassword).toBe(true)
    expect(createArgs.data.platformRole).toBe('customer')
    expect(hashPasswordMock).toHaveBeenCalled()
  })

  it('rejects a new client without a phone (activation data is mandatory)', async () => {
    const res = await POST(makeRequest({ email: 'nophone@client.lv', cardNumber: '1003' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('phone_required')
    expect(userCreateMock).not.toHaveBeenCalled()
  })

  it('rejects an invalid card number', async () => {
    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: 'abc123456789', phone: '+37120000000' }))

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_card')
  })

  it('maps a unique-constraint conflict on card number to 409', async () => {
    userCreateMock.mockRejectedValueOnce({ code: 'P2002' })
    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1004', phone: '+37120000000' }))

    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('card_taken')
  })

  it('rejects unauthenticated/non-admin callers', async () => {
    const { NextResponse } = await import('next/server')
    requireAdminMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    const res = await POST(makeRequest({ email: 'client@inbox.lv', cardNumber: '1005', phone: '+37120000000' }))

    expect(res.status).toBe(403)
    expect(userFindFirstMock).not.toHaveBeenCalled()
  })
})
