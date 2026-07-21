import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/mailer', () => ({ sendEmail: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn() }))
vi.mock('@/lib/turnstile-server', () => ({
  isTurnstileRequired: vi.fn(),
  verifyTurnstile: vi.fn(),
  TurnstileConfigurationError: class TurnstileConfigurationError extends Error {},
}))

import { sendEmail } from '@/lib/mailer'
import { checkRateLimit } from '@/lib/rate-limit'
import { isTurnstileRequired } from '@/lib/turnstile-server'
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
})
