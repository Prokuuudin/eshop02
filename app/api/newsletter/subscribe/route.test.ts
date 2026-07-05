import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/newsletter-store', () => ({ subscribeToNewsletter: vi.fn() }))

import { POST } from './route'
import { subscribeToNewsletter } from '@/lib/newsletter-store'

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
