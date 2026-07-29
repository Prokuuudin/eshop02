import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/server-auth', () => ({ getServerUser: vi.fn() }))
vi.mock('@/lib/reviews-data-store', () => ({ getReviewsByAuthor: vi.fn() }))

import { GET } from './route'
import { getServerUser } from '@/lib/server-auth'
import { getReviewsByAuthor } from '@/lib/reviews-data-store'

describe('GET /api/reviews/my', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getServerUser).mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(401)
    expect(getReviewsByAuthor).not.toHaveBeenCalled()
  })

  it('returns empty list when user has no display name', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com', name: undefined } as never)
    const res = await GET()
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.data.reviews).toEqual([])
    expect(getReviewsByAuthor).not.toHaveBeenCalled()
  })

  it('returns reviews matched by user name', async () => {
    vi.mocked(getServerUser).mockResolvedValue({ id: 'u1', email: 'a@b.com', name: 'Anna' } as never)
    vi.mocked(getReviewsByAuthor).mockResolvedValue([
      { id: 'rvw_1', productId: 'p1', author: 'Anna', rating: 5, title: 'T', text: 'X', createdAt: '2026-01-01T00:00:00.000Z', helpful: 0, status: 'pending' },
    ] as never)

    const res = await GET()
    const json = await res.json()

    expect(res.status).toBe(200)
    expect(getReviewsByAuthor).toHaveBeenCalledWith('Anna')
    expect(json.data.reviews).toHaveLength(1)
    expect(json.data.reviews[0].status).toBe('pending')
  })
})
