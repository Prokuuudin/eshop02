import { describe, expect, it } from 'vitest'
import {
  areAllReviewsSelected,
  filterReviews,
  reconcileReviewSelection,
  toggleReviewInSelection,
  toggleVisibleReviews,
  type ReviewRecord,
} from './reviews-model'

const review = (id: string, overrides: Partial<ReviewRecord> = {}): ReviewRecord => ({
  id,
  productId: `product-${id}`,
  author: `Author ${id}`,
  rating: 5,
  title: `Title ${id}`,
  text: `Text ${id}`,
  createdAt: '2026-01-01',
  helpful: 0,
  status: 'pending',
  ...overrides,
})

describe('reviews model', () => {
  it('searches review identity and content case-insensitively', () => {
    const reviews = [review('1', { author: 'Anna' }), review('2', { text: 'Excellent color' })]

    expect(filterReviews(reviews, ' anna ')).toEqual([reviews[0]])
    expect(filterReviews(reviews, 'COLOR')).toEqual([reviews[1]])
  })

  it('reconciles stale selections after reviews reload', () => {
    expect(reconcileReviewSelection(['1', 'missing'], [review('1'), review('2')])).toEqual(['1'])
  })

  it('toggles individual and all visible reviews without duplicates', () => {
    expect(toggleReviewInSelection(['1'], '1', true)).toEqual(['1'])
    expect(toggleVisibleReviews(['1', 'hidden'], [review('1'), review('2')], true)).toEqual(['1', 'hidden', '2'])
    expect(toggleVisibleReviews(['1', 'hidden'], [review('1')], false)).toEqual(['hidden'])
    expect(areAllReviewsSelected([review('1'), review('2')], ['2', '1'])).toBe(true)
    expect(areAllReviewsSelected([], [])).toBe(false)
  })
})
