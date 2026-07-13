import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: vi.fn(),
  createSession: vi.fn(),
  mapDbToServerUser: vi.fn((u: unknown) => u),
  SESSION_COOKIE: 'eshop_session',
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  gcRateLimitStore: vi.fn(),
}))

import { prisma } from '@/lib/prisma'
import { hashPassword, createSession } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/register-card', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const COMPANY = {
  id: 'company_1',
  companyName: 'SIA MIKS PLUS',
  cardNumber: '1234',
  approvalWorkflowEnabled: false,
}

function makeTx() {
  return {
    user: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })) },
    companyMember: { create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })) },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit as any).mockResolvedValue({ limited: false, resetAt: 0 })
  vi.mocked(hashPassword as any).mockResolvedValue('hashed')
  vi.mocked(createSession as any).mockResolvedValue('token')
})

describe('POST /api/auth/register-card', () => {
  it('rejects a card number with no matching company', async () => {
    vi.mocked(prisma.company.findFirst as any).mockResolvedValue(null)

    const res = await POST(makeRequest({ cardNumber: '9999' }))

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'card_not_found' })
  })

  it('rejects a card that already has a registered user', async () => {
    vi.mocked(prisma.company.findFirst as any).mockResolvedValue(COMPANY)
    vi.mocked(prisma.user.findFirst as any).mockResolvedValue({ id: 'existing-user' })

    const res = await POST(makeRequest({ cardNumber: '1234' }))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'card_already_registered' })
  })

  it('creates a real user bound to the company and a session on success', async () => {
    vi.mocked(prisma.company.findFirst as any).mockResolvedValue(COMPANY)
    vi.mocked(prisma.user.findFirst as any).mockResolvedValue(null)
    const tx = makeTx()
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const res = await POST(makeRequest({ cardNumber: '1234', name: 'Ivan' }))

    expect(res.status).toBe(201)
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'card.1234@client.local',
          companyId: 'company_1',
          companyName: 'SIA MIKS PLUS',
          teamRole: 'buyer',
          cardNumber: '1234',
        }),
      })
    )
    expect(tx.companyMember.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ companyId: 'company_1', role: 'buyer' }),
      })
    )
    expect(createSession).toHaveBeenCalled()
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('eshop_session=token')
  })

  it('rejects when the card number is blank', async () => {
    const res = await POST(makeRequest({ cardNumber: '   ' }))

    expect(res.status).toBe(400)
    expect(prisma.company.findFirst).not.toHaveBeenCalled()
  })

  it('rate-limits repeated attempts from the same IP', async () => {
    vi.mocked(checkRateLimit as any).mockResolvedValue({ limited: true, resetAt: Date.now() + 60_000 })

    const res = await POST(makeRequest({ cardNumber: '1234' }))

    expect(res.status).toBe(429)
  })
})
