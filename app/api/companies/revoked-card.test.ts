import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { getServerUserMock, settingMock, createMock, updateMock, adminRevocations } = vi.hoisted(() => ({
  adminRevocations: { row: null as unknown },
  getServerUserMock: vi.fn(), settingMock: vi.fn(), createMock: vi.fn(), updateMock: vi.fn(),
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/observability', () => ({ logApiError: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: getServerUserMock }))
vi.mock('@/lib/prisma', () => {
  const tx = { keyValueSetting: { findUnique: (args: { where: { key: string } }) => (args.where.key === 'revoked-client-cards:admin:v1' ? Promise.resolve(adminRevocations.row) : settingMock(args)) }, company: { create: createMock, update: updateMock } }
  return { prisma: { ...tx, $transaction: (run: (client: typeof tx) => unknown) => run(tx) } }
})

import { POST } from './route'
import { PATCH } from './[id]/route'
import { buildAdminRevocationValue, buildRevokedCardValue, revokedCardRow } from '@/lib/revoked-card-policy-fixture'

const json = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
const create = (cardNumber: string) => POST(new NextRequest('https://shop.test/api/companies', json({ companyId: 'c1', companyName: 'SIA Test', cardNumber })))
const update = (cardNumber: string) => PATCH(
  new NextRequest('https://shop.test/api/companies/c1', { ...json({ cardNumber }), method: 'PATCH' }),
  { params: Promise.resolve({ id: 'c1' }) },
)

beforeEach(() => {
  vi.clearAllMocks()
  getServerUserMock.mockResolvedValue({ id: 'admin-1', platformRole: 'admin' })
  settingMock.mockResolvedValue(revokedCardRow(buildRevokedCardValue({ '4001': 'u1' })))
  createMock.mockImplementation(async ({ data }) => ({ ...data, members: [] }))
  updateMock.mockImplementation(async ({ data }) => data)
})

describe('Company API — revoked client cards', () => {
  it('refuses a revoked number on create and update without writing', async () => {
    for (const response of [await create('04001'), await update('4001')]) {
      expect(response.status).toBe(409)
      expect(await response.json()).toEqual({ error: 'card_revoked' })
    }
    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).not.toHaveBeenCalled()
  })

  it('refuses a number revoked from the admin panel on create and update', async () => {
    adminRevocations.row = { value: buildAdminRevocationValue({ '4009': 'u-former' }) }
    try {
      for (const response of [await create('04009'), await update('4009')]) {
        expect(response.status).toBe(409)
        expect(await response.json()).toEqual({ error: 'card_revoked' })
      }
      expect(createMock).not.toHaveBeenCalled()
      expect(updateMock).not.toHaveBeenCalled()
    } finally {
      adminRevocations.row = null
    }
  })

  it('still accepts other numbers', async () => {
    expect((await create('7001')).status).toBe(200)
    expect((await update('7002')).status).toBe(200)
  })

  it('fails closed on a malformed registry', async () => {
    settingMock.mockResolvedValue(revokedCardRow({ active: true }))
    expect((await create('7001')).status).toBe(503)
    expect(createMock).not.toHaveBeenCalled()
  })
})
