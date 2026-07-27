import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessRequest: { findFirst: vi.fn(), create: vi.fn() },
    keyValueSetting: { upsert: vi.fn() },
    $transaction: vi.fn(),
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  gcRateLimitStore: vi.fn(),
}))
vi.mock('@/lib/turnstile-server', () => ({
  verifyTurnstile: vi.fn(),
  isTurnstileRequired: vi.fn(),
  TurnstileConfigurationError: class TurnstileConfigurationError extends Error {},
}))

import { prisma } from '@/lib/prisma'
import { hashPassword } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { isTurnstileRequired, TurnstileConfigurationError, verifyTurnstile } from '@/lib/turnstile-server'
import { POST } from './route'

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/access-requests', {
    method: 'POST',
    body: JSON.stringify({ privacyAcknowledged: true, ...body }),
    headers: { 'Content-Type': 'application/json' },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(hashPassword as any).mockResolvedValue('hashed')
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
  vi.mocked(verifyTurnstile).mockResolvedValue(true)
  vi.mocked(isTurnstileRequired).mockReturnValue(false)
  vi.mocked(prisma.accessRequest.findFirst as any).mockResolvedValue(null)
  vi.mocked(prisma.accessRequest.create as any).mockImplementation(async ({ data }: any) => ({ ...data }))
  vi.mocked(prisma.$transaction as any).mockImplementation(async (fn: any) => fn(prisma))
})

describe('POST /api/access-requests', () => {
  it('no-card заявка мастера принимается без company-полей и карты', async () => {
    const res = await POST(
      makeRequest({
        email: 'Master@inbox.lv',
        password: 'Welcome1!Change',
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

  it('сертификат из заявки сохраняется в KV на время рассмотрения', async () => {
    const dataUrl = 'data:image/jpeg;base64,' + Buffer.from('img').toString('base64')
    const res = await POST(
      makeRequest({
        email: 'master@inbox.lv',
        password: 'LongPassword1!',
        requestType: 'no-card',
        certificateName: 'diploms.jpg',
        certificateData: dataUrl,
      })
    )

    expect(res.status).toBe(201)
    const upsertArgs = vi.mocked(prisma.keyValueSetting.upsert).mock.calls[0][0] as any
    expect(upsertArgs.where.key).toMatch(/^access-request-cert-/)
    expect(upsertArgs.create.value.data).toBe(dataUrl)
    expect(upsertArgs.create.value.name).toBe('diploms.jpg')
  })

  it('слишком большой сертификат → 413, заявка не создаётся', async () => {
    const res = await POST(
      makeRequest({
        email: 'master@inbox.lv',
        password: 'LongPassword1!',
        requestType: 'no-card',
        certificateData: 'data:image/jpeg;base64,' + 'A'.repeat(2_500_000),
      })
    )

    expect(res.status).toBe(413)
    expect(vi.mocked(prisma.accessRequest.create)).not.toHaveBeenCalled()
  })

  it('битый certificateData (не data URL) → 400', async () => {
    const res = await POST(
      makeRequest({
        email: 'master@inbox.lv',
        password: 'LongPassword1!',
        requestType: 'no-card',
        certificateData: 'javascript:alert(1)',
      })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_certificate')
  })

  it('card-заявка без номера карты по-прежнему отвергается', async () => {
    const res = await POST(
      makeRequest({
        email: 'member@inbox.lv',
        password: 'LongPassword1!',
        companyId: 'c1',
        companyName: 'Salons',
        requestType: 'card',
      })
    )

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('missing_fields')
  })

  it('rejects short passwords before bcrypt', async () => {
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'short', requestType: 'no-card',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('weak_password')
    expect(hashPassword).not.toHaveBeenCalled()
  })

  it('rate-limits by IP before bcrypt', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
    }))
    expect(res.status).toBe(429)
    expect(hashPassword).not.toHaveBeenCalled()
  })

  it('requires and verifies Turnstile before bcrypt', async () => {
    vi.mocked(isTurnstileRequired).mockReturnValue(true)
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('captcha_required')
    expect(hashPassword).not.toHaveBeenCalled()
  })

  it('fails closed before bcrypt when Turnstile is not configured', async () => {
    vi.mocked(isTurnstileRequired).mockImplementation(() => { throw new TurnstileConfigurationError() })
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
    }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('captcha_not_configured')
    expect(hashPassword).not.toHaveBeenCalled()
    expect(prisma.accessRequest.create).not.toHaveBeenCalled()
  })

  it('maps a concurrent pending-request unique conflict to 409', async () => {
    vi.mocked(prisma.accessRequest.create).mockRejectedValueOnce({ code: 'P2002' } as never)
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
    }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('pending_exists')
  })
})
