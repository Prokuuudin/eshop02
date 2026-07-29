import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/reviews-data-store', () => ({
  createReview: vi.fn(),
  getProductPublicReviews: vi.fn(),
  getProductReviewStats: vi.fn(),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: vi.fn(), gcRateLimitStore: vi.fn() }))

import { POST } from './route'
import { getServerUser } from '@/lib/server-auth'
import { createReview } from '@/lib/reviews-data-store'
import { checkRateLimit } from '@/lib/rate-limit'

const makePost = (body: Record<string, unknown>): NextRequest =>
  new NextRequest('http://localhost/api/reviews', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const createdReview = { id: 'rvw_1', productId: 'p1', author: 'X', rating: 5, title: 'T', text: 'B', createdAt: '2026-01-01T00:00:00.000Z', helpful: 0, status: 'pending' }

describe('POST /api/reviews', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(createReview).mockResolvedValue(createdReview as never)
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: false, remaining: 2, resetAt: Date.now() + 60_000 })
  })

  it('forces author from session for logged-in user', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'Anna' } as never)

    const res = await POST(makePost({ productId: 'p1', author: 'Кто-то другой', rating: 5, title: 'T', text: 'B' }))

    expect(res.status).toBe(201)
    expect(vi.mocked(createReview).mock.calls[0][0].author).toBe('Anna')
  })

  it('keeps provided author for guests', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)

    const res = await POST(makePost({ productId: 'p1', author: 'Гость', rating: 4, title: 'T', text: 'B' }))

    expect(res.status).toBe(201)
    expect(vi.mocked(createReview).mock.calls[0][0].author).toBe('Гость')
  })

  it('rejects rating outside 1..5', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)

    const res = await POST(makePost({ productId: 'p1', author: 'Гость', rating: 9, title: 'T', text: 'B' }))

    expect(res.status).toBe(400)
    expect(createReview).not.toHaveBeenCalled()
  })

  it('rate-limits review creation before the DB write', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    vi.mocked(checkRateLimit).mockResolvedValue({ limited: true, remaining: 0, resetAt: Date.now() + 60_000 })
    const res = await POST(makePost({ productId: 'p1', rating: 5, title: 'T', text: 'B' }))
    expect(res.status).toBe(429)
    expect(createReview).not.toHaveBeenCalled()
  })

  it('rejects oversized review text', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await POST(makePost({ productId: 'p1', rating: 5, title: 'T', text: 'x'.repeat(5001) }))
    expect(res.status).toBe(400)
    expect(createReview).not.toHaveBeenCalled()
  })
})
