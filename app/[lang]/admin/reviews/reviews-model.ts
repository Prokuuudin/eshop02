export type ReviewStatus = 'approved' | 'hidden' | 'pending'

export type ReviewRecord = {
  id: string
  productId: string
  author: string
  rating: number
  title: string
  text: string
  createdAt: string
  helpful: number
  status: ReviewStatus
  adminReply?: { text: string; repliedAt: string }
}

export function filterReviews(reviews: ReviewRecord[], search: string): ReviewRecord[] {
  const query = search.trim().toLowerCase()
  if (!query) return reviews
  return reviews.filter((review) =>
    `${review.productId} ${review.author} ${review.title} ${review.text}`.toLowerCase().includes(query)
  )
}

export function reconcileReviewSelection(selectedIds: string[], reviews: ReviewRecord[]): string[] {
  const availableIds = new Set(reviews.map((review) => review.id))
  return selectedIds.filter((id) => availableIds.has(id))
}

export function toggleReviewInSelection(selectedIds: string[], reviewId: string, checked: boolean): string[] {
  if (checked) return Array.from(new Set([...selectedIds, reviewId]))
  return selectedIds.filter((id) => id !== reviewId)
}

export function toggleVisibleReviews(selectedIds: string[], reviews: ReviewRecord[], checked: boolean): string[] {
  const visibleIds = reviews.map((review) => review.id)
  if (checked) return Array.from(new Set([...selectedIds, ...visibleIds]))
  const visibleIdSet = new Set(visibleIds)
  return selectedIds.filter((id) => !visibleIdSet.has(id))
}

export function areAllReviewsSelected(reviews: ReviewRecord[], selectedIds: string[]): boolean {
  const selectedIdSet = new Set(selectedIds)
  return reviews.length > 0 && reviews.every((review) => selectedIdSet.has(review.id))
}
