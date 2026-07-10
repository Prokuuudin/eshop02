import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessRequest: { findFirst: vi.fn(), create: vi.fn() },
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/access-requests', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(hashPassword as any).mockResolvedValue('hashed')
  vi.mocked(prisma.accessRequest.findFirst as any).mockResolvedValue(null)
  vi.mocked(prisma.accessRequest.create as any).mockImplementation(async ({ data }: any) => ({ ...data }))
})

describe('POST /api/access-requests', () => {
  it('no-card заявка мастера принимается без company-полей и карты', async () => {
    const res = await POST(
      makeRequest({
        email: 'Master@inbox.lv',
        password: 'Welcome1!',
        name: 'Māra',
        requestType: 'no-card',
        certificateName: 'diploms.jpg',
        language: 'lv',
      })
    )

    expect(res.status).toBe(201)
    const createArgs = vi.mocked(prisma.accessRequest.create).mock.calls[0][0] as any
    expect(createArgs.data.email).toBe('master@inbox.lv')
    expect(createArgs.data.requestType).toBe('no-card')
    expect(createArgs.data.cardNumber).toBe('')
  })

  it('card-заявка без номера карты по-прежнему отвергается', async () => {
    const res = await POST(
      makeRequest({
        email: 'member@inbox.lv',
        password: 'x',
        companyId: 'c1',
        companyName: 'Salons',
        requestType: 'card',
      })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing_fields')
  })
})
