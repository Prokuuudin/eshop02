import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: vi.fn() },
}))
vi.mock('@/lib/server-auth', () => ({
  hashToken: vi.fn((t: string) => `hashed:${t}`),
  createSession: vi.fn(),
  SESSION_COOKIE: 'eshop_session',
}))

import { prisma } from '@/lib/prisma'
import { createSession } from '@/lib/server-auth'
import { GET } from './route'

function makeRequest(token?: string): NextRequest {
  const url = token
    ? `http://localhost/api/auth/confirm?token=${encodeURIComponent(token)}`
    : 'http://localhost/api/auth/confirm'
  return new NextRequest(url)
}

const PENDING_REG = {
  tokenHash: 'hashed:tok123',
  email: 'new@example.com',
  name: 'Ivan',
  cardNumber: '1234',
  phone: undefined,
  passwordHash: 'hashed-password',
  companyId: 'company_1',
  companyName: 'SIA MIKS PLUS',
  expiresAt: new Date(Date.now() + 60_000).toISOString(),
  language: 'ru',
}

function makeTx(opts: {
  registrations?: Array<Record<string, unknown>>
  existingUser?: unknown
  company?: unknown
} = {}) {
  const registrations = opts.registrations ?? [PENDING_REG]
  return {
    keyValueSetting: {
      findUnique: vi.fn(async () => ({ value: { registrations } })),
      upsert: vi.fn(async ({ create }: { create: { value: unknown } }) => create),
    },
    user: {
      findUnique: vi.fn(async () => opts.existingUser ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
    },
    company: {
      findUnique: vi.fn(async () =>
        'company' in opts ? opts.company : { id: 'company_1', approvalWorkflowEnabled: false }
      ),
    },
    companyMember: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(createSession as any).mockResolvedValue('session-token')
})

describe('GET /api/auth/confirm', () => {
  it('rejects a missing token', async () => {
    const res = await GET(makeRequest())

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'missing_token' })
  })

  it('rejects a token with no matching pending registration', async () => {
    const tx = makeTx({ registrations: [] })
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const res = await GET(makeRequest('tok123'))

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'invalid_token' })
  })

  it('consumes an expired token and reports token_expired', async () => {
    const tx = makeTx({ registrations: [{ ...PENDING_REG, expiresAt: new Date(Date.now() - 1000).toISOString() }] })
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const res = await GET(makeRequest('tok123'))

    expect(res.status).toBe(410)
    expect(await res.json()).toMatchObject({ error: 'token_expired' })
    expect(tx.keyValueSetting.upsert).toHaveBeenCalled()
    const written = vi.mocked(tx.keyValueSetting.upsert).mock.calls[0][0] as {
      create: { value: { registrations: unknown[] } }
    }
    expect(written.create.value.registrations).toHaveLength(0)
  })

  it('rejects when the email was registered by someone else in the meantime', async () => {
    const tx = makeTx({ existingUser: { id: 'someone-else' } })
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const res = await GET(makeRequest('tok123'))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'email_taken' })
    expect(tx.user.create).not.toHaveBeenCalled()
  })

  it('rejects when the company no longer exists', async () => {
    const tx = makeTx({ company: null })
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const res = await GET(makeRequest('tok123'))

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'company_not_found' })
  })

  it('creates the user and company member server-side, opens a session, and returns no payload', async () => {
    const tx = makeTx()
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const res = await GET(makeRequest('tok123'))
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(json).toEqual({ ok: true })
    expect(json.password).toBeUndefined()
    expect(json.payload).toBeUndefined()

    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'new@example.com',
          passwordHash: 'hashed-password',
          companyId: 'company_1',
          teamRole: 'buyer',
          mustChangePassword: false,
        }),
      })
    )
    expect(tx.companyMember.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ companyId: 'company_1', role: 'buyer' }) })
    )
    expect(createSession).toHaveBeenCalled()
    const setCookie = res.headers.get('set-cookie')
    expect(setCookie).toContain('eshop_session=session-token')
    expect(setCookie).toContain('HttpOnly')
  })

  it('retries once on a serialization conflict before succeeding', async () => {
    const tx = makeTx()
    let calls = 0
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => {
      calls += 1
      if (calls === 1) {
        const err: any = new Error('conflict')
        err.code = 'P2034'
        throw err
      }
      return fn(tx)
    })

    const res = await GET(makeRequest('tok123'))

    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })
})
