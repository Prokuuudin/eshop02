import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: { update: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  getServerUser: vi.fn(),
  SESSION_COOKIE: 'eshop_session',
}))

import { prisma } from '@/lib/prisma'
import { getServerUser } from '@/lib/server-auth'
import { PATCH } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/user/profile', {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', cookie: 'eshop_session=tok' },
  })
}

const SESSION_USER = { id: 'u1', email: 'user@test.com' }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(getServerUser as any).mockResolvedValue(SESSION_USER)
  vi.mocked(prisma.user.update as any).mockImplementation(async ({ data }: any) => ({
    id: 'u1',
    email: 'user@test.com',
    name: data.name ?? null,
    phone: data.phone ?? null,
    avatarUrl: data.avatarUrl ?? null,
    cardNumber: null,
  }))
})

describe('PATCH /api/user/profile', () => {
  it('never writes cardNumber from the client (card is set at registration only)', async () => {
    const res = await PATCH(makeRequest({ cardNumber: 'ZZ-AUDIT-TEST' }))

    expect(res.status).toBe(200)
    const updateArgs = vi.mocked(prisma.user.update).mock.calls[0][0] as any
    expect(updateArgs.data).not.toHaveProperty('cardNumber')
  })

  it('still updates safe personal fields', async () => {
    const res = await PATCH(makeRequest({ name: 'New Name', phone: '+37120000000' }))

    expect(res.status).toBe(200)
    const updateArgs = vi.mocked(prisma.user.update).mock.calls[0][0] as any
    expect(updateArgs.data.name).toBe('New Name')
    expect(updateArgs.data.phone).toBe('+37120000000')
  })

  it('rejects an actual email change (IDOR guard)', async () => {
    const res = await PATCH(makeRequest({ email: 'victim@example.com' }))

    expect(res.status).toBe(400)
    expect(prisma.user.update).not.toHaveBeenCalled()
  })
})
