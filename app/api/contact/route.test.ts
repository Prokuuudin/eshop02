import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/lib/turnstile-server', () => ({
  isTurnstileRequired: vi.fn(),
  verifyTurnstile: vi.fn(),
  TurnstileConfigurationError: class TurnstileConfigurationError extends Error {},
}))
vi.mock('@/lib/prisma', () => ({
  prisma: { contactMessage: { create: vi.fn(), update: vi.fn() } },
}))

import { sendEmail } from '@/lib/mailer'
import { checkRateLimit } from '@/lib/rate-limit'
import { isTurnstileRequired } from '@/lib/turnstile-server'
import { prisma } from '@/lib/prisma'
import { POST } from './route'

function makeRequest(email = ' Buyer@Example.com ') {
  return new NextRequest('http://localhost/api/contact', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-forwarded-for': '203.0.113.8, 10.0.0.1',
    },
    body: JSON.stringify({
      name: 'Buyer', email, subject: 'Question', message: 'A sufficiently long message',
      submittedAt: Date.now() - 2000,
    }),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CONTACT_TO = 'admin@example.com'
  vi.mocked(isTurnstileRequired).mockReturnValue(false)
  vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
  vi.mocked(sendEmail).mockResolvedValue(undefined)
  vi.mocked(prisma.contactMessage.create).mockResolvedValue({ id: 'msg-1' } as never)
  vi.mocked(prisma.contactMessage.update).mockResolvedValue({} as never)
})

describe('POST /api/contact', () => {
  it('uses DB-backed limits for IP and normalized email', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(checkRateLimit).toHaveBeenNthCalledWith(1, 'contact:ip:203.0.113.8', expect.any(Object))
    expect(checkRateLimit).toHaveBeenNthCalledWith(2, 'contact:email:buyer@example.com', expect.any(Object))
    expect(sendEmail).toHaveBeenCalledOnce()
  })

  it('stops an email-limited request before SMTP', async () => {
    vi.mocked(checkRateLimit)
      .mockResolvedValueOnce({ limited: false, remaining: 4, resetAt: Date.now() + 60_000 })
      .mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makeRequest())
    expect(res.status).toBe(429)
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('persists the message before attempting to send email, so a submission is never lost', async () => {
    await POST(makeRequest())
    expect(prisma.contactMessage.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: 'buyer@example.com', subject: 'Question', emailStatus: 'pending' }),
      })
    )
    expect(vi.mocked(prisma.contactMessage.create).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(sendEmail).mock.invocationCallOrder[0])
  })

  it('still returns ok and records emailStatus:sent when delivery succeeds', async () => {
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(prisma.contactMessage.update).toHaveBeenCalledWith({ where: { id: 'msg-1' }, data: { emailStatus: 'sent' } })
  })

  it('still returns ok and records emailStatus:failed when SMTP throws, instead of silently losing the lead', async () => {
    vi.mocked(sendEmail).mockRejectedValueOnce(new Error('smtp timeout'))
    const res = await POST(makeRequest())
    const body = await res.json()
    expect(res.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(prisma.contactMessage.update).toHaveBeenCalledWith({
      where: { id: 'msg-1' },
      data: { emailStatus: 'failed', emailError: 'smtp timeout' },
    })
  })

  it('records emailStatus:not_configured instead of silently pretending the message was sent when no admin email is set', async () => {
    delete process.env.CONTACT_TO
    delete process.env.SMTP_USER
    const res = await POST(makeRequest())
    expect(res.status).toBe(200)
    expect(sendEmail).not.toHaveBeenCalled()
    expect(prisma.contactMessage.update).toHaveBeenCalledWith({ where: { id: 'msg-1' }, data: { emailStatus: 'not_configured' } })
  })
})
