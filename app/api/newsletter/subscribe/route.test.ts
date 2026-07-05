import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/newsletter-store', () => ({ subscribeToNewsletter: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), gcRateLimitStore: vi.fn() }))

import { POST } from './route'
import { subscribeToNewsletter } from '@/lib/newsletter-store'
import { checkRateLimit } from '@/lib/rate-limit'

const makePost = (body: Record<string, unknown>): NextRequest =>
  new NextRequest('http://localhost/api/newsletter/subscribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

describe('POST /api/newsletter/subscribe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(subscribeToNewsletter).mockResolvedValue(undefined)
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 9, resetAt: 0 })
  })

  it('rejects when rate limited', async () => {
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makePost({ email: 'a@b.com', consent: true }))
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.error).toBe('rate_limited')
    expect(subscribeToNewsletter).not.toHaveBeenCalled()
  })

  it('rejects an email over the length cap', async () => {
    const longEmail = `${'a'.repeat(155)}@b.com`
    const res = await POST(makePost({ email: longEmail, consent: true }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_email')
    expect(subscribeToNewsletter).not.toHaveBeenCalled()
  })

  it('rejects an invalid email', async () => {
    const res = await POST(makePost({ email: 'not-an-email', consent: true }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('invalid_email')
    expect(subscribeToNewsletter).not.toHaveBeenCalled()
  })

  it('rejects when consent is not true', async () => {
    const res = await POST(makePost({ email: 'a@b.com', consent: false }))
    expect(res.status).toBe(400)
    const json = await res.json()
    expect(json.error).toBe('consent_required')
    expect(subscribeToNewsletter).not.toHaveBeenCalled()
  })

  it('subscribes with a valid email and consent', async () => {
    const res = await POST(makePost({ email: 'A@B.com', consent: true }))
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(subscribeToNewsletter).toHaveBeenCalledWith('A@B.com')
  })
})
