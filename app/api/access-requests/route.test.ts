import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

const {
  accessRequestFindFirstMock,
  accessRequestCreateMock,
  settingUpsertMock,
  transactionMock,
  hashPasswordMock,
  sendEmailMock,
} = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  accessRequestFindFirstMock: vi.fn(),
  accessRequestCreateMock: vi.fn(),
  settingUpsertMock: vi.fn(),
  transactionMock: vi.fn(),
  hashPasswordMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    accessRequest: {
      findFirst: accessRequestFindFirstMock,
      create: accessRequestCreateMock,
    },
    keyValueSetting: { upsert: settingUpsertMock },
    $transaction: transactionMock,
  },
}))
vi.mock('@/lib/server-auth', () => ({
  hashPassword: hashPasswordMock,
}))
vi.mock('@/lib/mailer', () => ({
  sendEmail: sendEmailMock,
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
  hashPasswordMock.mockResolvedValue('hashed')
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
  vi.mocked(verifyTurnstile).mockResolvedValue(true)
  vi.mocked(isTurnstileRequired).mockReturnValue(false)
  accessRequestFindFirstMock.mockResolvedValue(null)
  accessRequestCreateMock.mockImplementation(async ({ data }) => ({ ...data }))
  transactionMock.mockImplementation(async (fn) => fn(prisma))
  sendEmailMock.mockResolvedValue(undefined)
  vi.stubEnv('CONTACT_TO', 'admin@shop.test')
  vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://shop.test')
})

afterEach(() => {
  vi.unstubAllEnvs()
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
    const createArgs = accessRequestCreateMock.mock.calls[0][0] as {
      data: Record<string, unknown>
    }
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
    const upsertArgs = settingUpsertMock.mock.calls[0][0] as {
      where: { key: string }
      create: { value: { data: string; name: string } }
    }
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
    expect(accessRequestCreateMock).not.toHaveBeenCalled()
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
    expect(hashPasswordMock).not.toHaveBeenCalled()
  })

  it('rate-limits by IP before bcrypt', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
    }))
    expect(res.status).toBe(429)
    expect(hashPasswordMock).not.toHaveBeenCalled()
  })

  it('requires and verifies Turnstile before bcrypt', async () => {
    vi.mocked(isTurnstileRequired).mockReturnValue(true)
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
    }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('captcha_required')
    expect(hashPasswordMock).not.toHaveBeenCalled()
  })

  it('fails closed before bcrypt when Turnstile is not configured', async () => {
    vi.mocked(isTurnstileRequired).mockImplementation(() => { throw new TurnstileConfigurationError() })
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
    }))
    expect(res.status).toBe(503)
    expect((await res.json()).error).toBe('captcha_not_configured')
    expect(hashPasswordMock).not.toHaveBeenCalled()
    expect(accessRequestCreateMock).not.toHaveBeenCalled()
  })

  it('maps a concurrent pending-request unique conflict to 409', async () => {
    accessRequestCreateMock.mockRejectedValueOnce({ code: 'P2002' })
    const res = await POST(makeRequest({
      email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
    }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe('pending_exists')
    expect(sendEmailMock).not.toHaveBeenCalled()
  })

  describe('admin notification', () => {
    it('emails CONTACT_TO about a card request with escaped details and an admin link', async () => {
      const res = await POST(makeRequest({
        email: 'Salon@inbox.lv', password: 'LongPassword1!', requestType: 'card',
        name: 'Anna <b>Bērziņa</b>', phone: '+37120000000',
        companyId: '40003000000', companyName: 'Salons SIA', cardNumber: '5044',
      }))
      expect(res.status).toBe(201)
      expect(sendEmailMock).toHaveBeenCalledTimes(1)
      const [to, subject, html] = sendEmailMock.mock.calls[0] as [string, string, string]
      expect(to).toBe('admin@shop.test')
      expect(subject).toContain('с картой клиента')
      expect(html).toContain('salon@inbox.lv')
      expect(html).toContain('Salons SIA')
      expect(html).toContain('5044')
      expect(html).toContain('Anna &lt;b&gt;Bērziņa&lt;/b&gt;')
      expect(html).not.toContain('<b>Bērziņa</b>')
      expect(html).toContain('href="https://shop.test/admin"')
      expect(html).not.toContain('LongPassword1!')
    })

    it('emails CONTACT_TO about a no-card request', async () => {
      await POST(makeRequest({
        email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
        name: 'Māra\r\nBcc: x@evil.test',
      }))
      expect(sendEmailMock).toHaveBeenCalledTimes(1)
      const [, subject] = sendEmailMock.mock.calls[0] as [string, string, string]
      expect(subject).toContain('без карты клиента')
      expect(subject).not.toMatch(/[\r\n]/)
    })

    it('still returns 201 when the mailer fails', async () => {
      sendEmailMock.mockRejectedValueOnce(new Error('smtp down'))
      const res = await POST(makeRequest({
        email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
      }))
      expect(res.status).toBe(201)
      expect(accessRequestCreateMock).toHaveBeenCalledTimes(1)
    })

    it('skips the email when CONTACT_TO is not configured', async () => {
      vi.stubEnv('CONTACT_TO', '')
      const res = await POST(makeRequest({
        email: 'master@inbox.lv', password: 'LongPassword1!', requestType: 'no-card',
      }))
      expect(res.status).toBe(201)
      expect(sendEmailMock).not.toHaveBeenCalled()
    })

    it('does not email on a rejected request', async () => {
      const res = await POST(makeRequest({
        email: 'master@inbox.lv', password: 'short', requestType: 'no-card',
      }))
      expect(res.status).toBe(400)
      expect(sendEmailMock).not.toHaveBeenCalled()
    })
  })
})
