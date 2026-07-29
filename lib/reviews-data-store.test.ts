import { describe, expect, it, vi, beforeEach } from 'vitest'

const {
  reviewCreateMock,
  reviewFindUniqueMock,
  reviewFindManyMock,
  reviewUpdateMock,
  reviewUpdateManyMock,
  reviewDeleteMock,
  reviewAggregateMock,
  helpfulVoteCreateMock,
  transactionMock,
} = vi.hoisted(() => ({
  reviewCreateMock: vi.fn(),
  reviewFindUniqueMock: vi.fn(),
  reviewFindManyMock: vi.fn(),
  reviewUpdateMock: vi.fn(),
  reviewUpdateManyMock: vi.fn(),
  reviewDeleteMock: vi.fn(),
  reviewAggregateMock: vi.fn(),
  helpfulVoteCreateMock: vi.fn(),
  transactionMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    review: {
      create: reviewCreateMock,
      findUnique: reviewFindUniqueMock,
      findMany: reviewFindManyMock,
      update: reviewUpdateMock,
      updateMany: reviewUpdateManyMock,
      delete: reviewDeleteMock,
      aggregate: reviewAggregateMock,
    },
    product: {
      updateMany: vi.fn(),
    },
    reviewHelpfulVote: { create: helpfulVoteCreateMock },
    $transaction: transactionMock,
  },
}))

import { prisma } from '@/lib/prisma'
import {
  createReview,
  deleteReview,
  recomputeProductRating,
  updateReviewStatus,
  markReviewHelpful,
} from '@/lib/reviews-data-store'

const dbReview = (overrides: Record<string, unknown> = {}) => ({
  id: 'rvw_1',
  productId: 'p1',
  author: 'Anna',
  rating: 5,
  title: 'Отлично',
  text: 'Супер',
  createdAt: new Date('2026-01-01'),
  helpful: 0,
  status: 'approved',
  adminReply: null,
  ...overrides,
})

beforeEach(() => {
  vi.clearAllMocks()
  transactionMock.mockImplementation(async (fn) => fn(prisma))
})

describe('markReviewHelpful', () => {
  it('creates one unique vote and increments an approved review atomically', async () => {
    helpfulVoteCreateMock.mockResolvedValue({})
    reviewUpdateManyMock.mockResolvedValue({ count: 1 })

    await expect(markReviewHelpful('rvw_1', 'user:u1')).resolves.toBe('incremented')
    expect(prisma.reviewHelpfulVote.create).toHaveBeenCalledWith({
      data: { reviewId: 'rvw_1', voterKey: 'user:u1' },
    })
    expect(prisma.review.updateMany).toHaveBeenCalledTimes(1)
  })

  it('does not increment when the unique vote already exists', async () => {
    helpfulVoteCreateMock.mockRejectedValue({ code: 'P2002' })

    await expect(markReviewHelpful('rvw_1', 'user:u1')).resolves.toBe('duplicate')
    expect(prisma.review.updateMany).not.toHaveBeenCalled()
  })
})

describe('createReview', () => {
  it('creates review with pending status (premoderation)', async () => {
    reviewCreateMock.mockImplementation(async ({ data }) => dbReview(data))

    const review = await createReview({ productId: 'p1', author: 'Anna', rating: 5, title: 'Отлично', text: 'Супер' })

    expect(review.status).toBe('pending')
    expect(vi.mocked(prisma.review.create).mock.calls[0][0].data.status).toBe('pending')
  })

  it('does not touch product aggregates for pending review', async () => {
    reviewCreateMock.mockImplementation(async ({ data }) => dbReview(data))

    await createReview({ productId: 'p1', author: 'Anna', rating: 5, title: 'Отлично', text: 'Супер' })

    expect(prisma.product.updateMany).not.toHaveBeenCalled()
  })
})

describe('recomputeProductRating', () => {
  it('writes approved-only aggregate into product fields', async () => {
    reviewAggregateMock.mockResolvedValue({ _avg: { rating: 4.666666666666667 }, _count: 3 })

    await recomputeProductRating('p1')

    expect(prisma.review.aggregate).toHaveBeenCalledWith({
      where: { productId: 'p1', status: 'approved' },
      _avg: { rating: true },
      _count: true,
    })
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { rating: 4.67, ratingCount: 3, reviewCount: 3 },
    })
  })

  it('resets fields to zero when no approved reviews left', async () => {
    reviewAggregateMock.mockResolvedValue({ _avg: { rating: null }, _count: 0 })

    await recomputeProductRating('p1')

    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { rating: 0, ratingCount: 0, reviewCount: 0 },
    })
  })
})

describe('updateReviewStatus', () => {
  it('recomputes product rating after status change', async () => {
    reviewFindUniqueMock.mockResolvedValue(dbReview({ status: 'pending' }))
    reviewUpdateMock.mockResolvedValue(dbReview())
    reviewAggregateMock.mockResolvedValue({ _avg: { rating: 5 }, _count: 1 })

    const changed = await updateReviewStatus('rvw_1', 'approved')

    expect(changed).toBe(true)
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { rating: 5, ratingCount: 1, reviewCount: 1 },
    })
  })

  it('returns false and skips recompute when review missing', async () => {
    reviewFindUniqueMock.mockResolvedValue(null)

    const changed = await updateReviewStatus('nope', 'approved')

    expect(changed).toBe(false)
    expect(prisma.product.updateMany).not.toHaveBeenCalled()
  })
})

describe('deleteReview', () => {
  it('recomputes product rating after delete', async () => {
    reviewFindUniqueMock.mockResolvedValue(dbReview())
    reviewDeleteMock.mockResolvedValue(dbReview())
    reviewAggregateMock.mockResolvedValue({ _avg: { rating: null }, _count: 0 })

    const changed = await deleteReview('rvw_1')

    expect(changed).toBe(true)
    expect(prisma.product.updateMany).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { rating: 0, ratingCount: 0, reviewCount: 0 },
    })
  })
})

describe('getReviewsByAuthor', () => {
  it('returns reviews for author, newest first, all statuses', async () => {
    const { getReviewsByAuthor } = await import('@/lib/reviews-data-store')
    reviewFindManyMock.mockResolvedValue([dbReview({ status: 'pending' })])

    const rows = await getReviewsByAuthor('Anna')

    expect(prisma.review.findMany).toHaveBeenCalledWith({
      where: { author: 'Anna' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('pending')
  })
})
