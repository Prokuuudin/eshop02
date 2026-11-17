import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextResponse } from 'next/server'

const { gateMock, userFindManyMock, settings } = vi.hoisted(() => ({
  gateMock: vi.fn(),
  userFindManyMock: vi.fn(),
  settings: {} as Record<string, unknown>,
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/server-auth', () => ({ requireAdminPermission: gateMock }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { findMany: userFindManyMock },
    keyValueSetting: {
      findUnique: async ({ where }: { where: { key: string } }) =>
        (where.key in settings ? { value: structuredClone(settings[where.key]), updatedAt: new Date('2026-11-16T10:00:00Z') } : null),
    },
  },
}))

import { GET } from './route'
import { resetRevokedCardPolicyCache } from '@/lib/revoked-card-policy'
import { buildRevokedCardValue } from '@/lib/revoked-card-policy-fixture'

const BATCH_KEY = 'revoked-client-cards:v1'
const ADMIN_KEY = 'revoked-client-cards:admin:v1'
const revocation = (userId: string) => ({ userId, revokedAt: '2026-11-17T10:00:00.000Z', revokedBy: 'admin-1', reason: 'Card lost' })
const suggested = async () => (await (await GET()).json()) as { cardNumber?: string; error?: string }

beforeEach(() => {
  vi.clearAllMocks()
  resetRevokedCardPolicyCache()
  for (const key of Object.keys(settings)) delete settings[key]
  gateMock.mockResolvedValue({ id: 'admin-1', platformRole: 'admin' })
  userFindManyMock.mockResolvedValue([{ cardNumber: '1000' }, { cardNumber: '1001' }])
})

describe('GET /api/admin/card-request/next-number', () => {
  it('suggests the first number held by nobody', async () => {
    expect(await suggested()).toEqual({ cardNumber: '1002' })
  })

  it('never suggests a number revoked from the admin panel, even though no account holds it', async () => {
    settings[ADMIN_KEY] = { cards: { '1002': revocation('u-anna'), '1003': revocation('u-boris') } }
    expect(await suggested()).toEqual({ cardNumber: '1004' })
  })

  it('never suggests a number from the 2026-11-16 batch', async () => {
    settings[BATCH_KEY] = buildRevokedCardValue({ '1002': 'u-batch' })
    expect(await suggested()).toEqual({ cardNumber: '1003' })
  })

  it('fails closed (503) when the admin registry cannot be read', async () => {
    settings[ADMIN_KEY] = { cards: { '1002': { userId: 'u-anna' } } }
    const response = await GET()
    expect(response.status).toBe(503)
  })

  it('needs customers.read', async () => {
    gateMock.mockResolvedValue(NextResponse.json({ error: 'forbidden' }, { status: 403 }))
    expect((await GET()).status).toBe(403)
    expect(userFindManyMock).not.toHaveBeenCalled()
  })
})
