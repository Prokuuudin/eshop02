import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    company: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    keyValueSetting: { findUnique: vi.fn(), upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: vi.fn(),
  hashToken: vi.fn((t: string) => `hashed:${t}`),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  gcRateLimitStore: vi.fn(),
}))
vi.mock('@/lib/mailer', () => ({
  sendEmail: vi.fn(),
}))
vi.mock('@/lib/email-templates-server-store', () => ({
  getTemplates: vi.fn(async () => []),
}))

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { sendEmail } from '@/lib/mailer'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })
}

const VALID_BODY = {
  email: 'New@Example.com',
  cardNumber: '1234',
  password: 'supersecret1',
  companyId: 'company_1',
  companyName: 'SIA MIKS PLUS',
}

function makeTx(kv: { value?: unknown } | null = null) {
  return {
    keyValueSetting: {
      findUnique: vi.fn(async () => kv),
      upsert: vi.fn(async ({ create }: { create: { value: unknown } }) => create),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(checkRateLimit as any).mockResolvedValue({ limited: false, resetAt: 0 })
  vi.mocked(hashPassword as any).mockResolvedValue('hashed-password')
  vi.mocked(prisma.company.findUnique as any).mockResolvedValue({ id: 'company_1' })
  vi.mocked(prisma.user.findUnique as any).mockResolvedValue(null)
  vi.mocked(sendEmail as any).mockResolvedValue(undefined)
})

describe('POST /api/auth/register', () => {
  it('rate-limits repeated attempts from the same IP', async () => {
    vi.mocked(checkRateLimit as any).mockResolvedValue({ limited: true, resetAt: Date.now() + 60_000 })

    const res = await POST(makeRequest(VALID_BODY))

    expect(res.status).toBe(429)
  })

  it('rejects when a required field is missing', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, password: undefined }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'missing_fields' })
  })

  it('rejects a short password', async () => {
    const res = await POST(makeRequest({ ...VALID_BODY, password: 'short' }))

    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ error: 'weak_password' })
  })

  it('rejects an unknown companyId', async () => {
    vi.mocked(prisma.company.findUnique as any).mockResolvedValue(null)

    const res = await POST(makeRequest(VALID_BODY))

    expect(res.status).toBe(404)
    expect(await res.json()).toMatchObject({ error: 'company_not_found' })
  })

  it('rejects an email that already has an account', async () => {
    vi.mocked(prisma.user.findUnique as any).mockResolvedValue({ id: 'existing' })

    const res = await POST(makeRequest(VALID_BODY))

    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ error: 'email_taken' })
  })

  it('stores only a hashed password and hashed token, never the raw values', async () => {
    const tx = makeTx()
    vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(tx))

    const res = await POST(makeRequest(VALID_BODY))

    expect(res.status).toBe(200)
    expect(tx.keyValueSetting.upsert).toHaveBeenCalled()
    const written = vi.mocked(tx.keyValueSetting.upsert).mock.calls[0][0] as {
      create: { value: { registrations: Array<Record<string, unknown>> } }
    }
    const reg = written.create.value.registrations[0]
    expect(reg.passwordHash).toBe('hashed-password')
    expect(reg.tokenHash).toMatch(/^hashed:/)
    expect(reg).not.toHaveProperty('password')
    expect(reg).not.toHaveProperty('token')
    expect(reg.email).toBe('new@example.com')

    // The confirmation link (raw token) is only ever emailed, not persisted.
    const emailHtml = vi.mocked(sendEmail).mock.calls[0][2] as string
    expect(emailHtml).toContain('/auth/confirm?token=')
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

    const res = await POST(makeRequest(VALID_BODY))

    expect(res.status).toBe(200)
    expect(calls).toBe(2)
  })
})
