import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/reviews-data-store', () => ({ markReviewHelpful: vi.fn() }))
vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: vi.fn(),
  gcRateLimitStore: vi.fn(),
}))

import { markReviewHelpful } from '@/lib/reviews-data-store'
import { getServerUser } from '@/lib/server-auth'
import { checkRateLimit } from '@/lib/rate-limit'
import { POST } from './route'

const request = (cookie?: string) => new NextRequest('http://localhost/api/reviews/helpful', {
  method: 'POST',
  body: JSON.stringify({ id: 'rvw_1' }),
  headers: cookie ? { cookie } : undefined,
})

describe('POST /api/reviews/helpful', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getServerUser).mockResolvedValue(null)
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 9, resetAt: Date.now() + 60_000 })
    vi.mocked(markReviewHelpful).mockResolvedValue('incremented')
  })

  it('assigns an HttpOnly anonymous voter cookie', async () => {
    const response = await POST(request())
    expect(response.status).toBe(200)
    expect(response.headers.get('set-cookie')).toContain('review_voter=')
    expect(response.headers.get('set-cookie')).toContain('HttpOnly')
    expect(markReviewHelpful).toHaveBeenCalledWith('rvw_1', expect.stringMatching(/^anon:/))
  })

  it('reuses the anonymous identifier and reports a duplicate without incrementing', async () => {
    vi.mocked(markReviewHelpful).mockResolvedValue('duplicate')
    const response = await POST(request('review_voter=visitor-1'))
    expect(response.status).toBe(200)
    expect((await response.json()).data.counted).toBe(false)
    expect(markReviewHelpful).toHaveBeenCalledWith('rvw_1', 'anon:visitor-1')
  })

  it('rate-limits before recording a vote', async () => {
    vi.mocked(checkRateLimit).mockResolvedValueOnce({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const response = await POST(request('review_voter=visitor-1'))
    expect(response.status).toBe(429)
    expect(markReviewHelpful).not.toHaveBeenCalled()
  })
})
