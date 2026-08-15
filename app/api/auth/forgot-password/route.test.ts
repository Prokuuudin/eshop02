import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import crypto from 'crypto'

const { transactionMock, userFindUniqueMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  userFindUniqueMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { $transaction: transactionMock, user: { findUnique: userFindUniqueMock } },
}))
vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/email-templates-server-store', () => ({ getTemplates: vi.fn(async () => []) }))
vi.mock('@/lib/site-url', () => ({ getSiteUrl: vi.fn(() => 'https://shop.test') }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(async () => ({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })),
  gcRateLimitStore: vi.fn(),
}))

import { sendEmail } from '@/lib/mailer'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

function request(email = 'user@test.com', language = 'en') {
  return new NextRequest('https://shop.test/api/auth/forgot-password', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.5' },
    body: JSON.stringify({ email, language }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  userFindUniqueMock.mockResolvedValue({ id: 'u1' })
  vi.mocked(sendEmail).mockResolvedValue(undefined)
})

describe('POST /api/auth/forgot-password', () => {
  it('stores only a token hash and replaces old tokens transactionally', async () => {
    const tx = {
      passwordResetToken: { deleteMany: vi.fn(), create: vi.fn() },
    }
    transactionMock.mockImplementation(async (fn) => fn(tx))

    const res = await POST(request())
    expect(res.status).toBe(200)

    const html = vi.mocked(sendEmail).mock.calls[0][2]
    const rawToken = /[?&]token=([a-f0-9]+)/.exec(html)?.[1]
    expect(rawToken).toBeTruthy()
    expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    const data = tx.passwordResetToken.create.mock.calls[0][0].data
    expect(data.tokenHash).toBe(crypto.createHash('sha256').update(rawToken!).digest('hex'))
    expect(JSON.stringify(data)).not.toContain(rawToken!)
    expect(data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 59 * 60_000)
    expect(data.expiresAt.getTime()).toBeLessThanOrEqual(Date.now() + 60 * 60_000)
  })

  it.each([
    ['ru', 'Сброс пароля'],
    ['en', 'Password reset'],
    ['lv', 'Paroles atjaunošana'],
  ])('renders the %s reset email with a trusted one-hour link', async (language, subjectText) => {
    const tx = { passwordResetToken: { deleteMany: vi.fn(), create: vi.fn() } }
    transactionMock.mockImplementation(async (fn) => fn(tx))

    await POST(request('user@test.com', language))

    const [, subject, html] = vi.mocked(sendEmail).mock.calls[0]
    expect(subject).toContain(subjectText)
    expect(html).toMatch(/https:\/\/shop\.test\/auth\/reset-password\?token=[a-f0-9]{64}/)
    expect(html).not.toContain('203.0.113.5')
    expect(html).not.toContain('passwordHash')
  })

  it('does not reveal whether an address exists', async () => {
    userFindUniqueMock.mockResolvedValue(null)
    const unknown = await POST(request('unknown@test.com'))
    const unknownBody = await unknown.json()

    userFindUniqueMock.mockResolvedValue({ id: 'u1' })
    const tx = { passwordResetToken: { deleteMany: vi.fn(), create: vi.fn() } }
    transactionMock.mockImplementation(async (fn) => fn(tx))
    const known = await POST(request('user@test.com'))

    expect(known.status).toBe(unknown.status)
    expect(await known.json()).toEqual(unknownBody)
    expect(unknownBody).toEqual({ ok: true })
  })

  it('rate-limits by both IP and normalized email', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })

    const res = await POST(request(' User@Test.com '))
    expect(res.status).toBe(429)
    expect(checkRateLimit).toHaveBeenCalledWith('forgot-password:ip:203.0.113.5')
    expect(checkRateLimit).toHaveBeenCalledWith('forgot-password:email:user@test.com')
    expect(transactionMock).not.toHaveBeenCalled()
  })
})
