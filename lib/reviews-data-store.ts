import { promises as fs } from 'node:fs'
import path from 'node:path'

export type ReviewModerationStatus = 'approved' | 'hidden' | 'pending'

export type ReviewRecord = {
  id: string
  productId: string
  author: string
  rating: number
  title: string
  text: string
  createdAt: string
  helpful: number
  status: ReviewModerationStatus
}

export type CreateReviewInput = {
  productId: string
  author: string
  rating: number
  title: string
  text: string
}

const REVIEWS_FILE_PATH = path.join(process.cwd(), 'data', 'reviews.json')

const readReviewsFile = async (): Promise<ReviewRecord[]> => {
  try {
    const raw = await fs.readFile(REVIEWS_FILE_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as ReviewRecord[]
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item): item is ReviewRecord => !!item && typeof item === 'object' && typeof item.id === 'string')
      .map((item) => ({
        ...item,
        status: item.status === 'hidden' || item.status === 'pending' ? item.status : 'approved',
        helpful: Number.isFinite(item.helpful) ? item.helpful : 0,
        createdAt: item.createdAt || new Date().toISOString()
      }))
  } catch {
    return []
  }
}

const writeReviewsFile = async (reviews: ReviewRecord[]): Promise<void> => {
  await fs.writeFile(REVIEWS_FILE_PATH, JSON.stringify(reviews, null, 2), 'utf-8')
}

export const getAllReviews = async (): Promise<ReviewRecord[]> => {
  const reviews = await readReviewsFile()
  return reviews.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
}

export const getProductPublicReviews = async (productId: string): Promise<ReviewRecord[]> => {
  const reviews = await getAllReviews()
  return reviews.filter((review) => review.productId === productId && review.status === 'approved')
}

export const getProductReviewStats = async (productId: string): Promise<{ averageRating: number; count: number; distribution: Record<number, number> }> => {
  const reviews = await getProductPublicReviews(productId)
  if (!reviews.length) {
    return {
      averageRating: 0,
      count: 0,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
    }
  }

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  reviews.forEach((review) => {
    const normalized = Math.max(1, Math.min(5, Math.round(review.rating)))
    distribution[normalized] += 1
  })

  const sum = reviews.reduce((acc, review) => acc + review.rating, 0)
  const averageRating = Math.round((sum / reviews.length) * 10) / 10

  return {
    averageRating,
    count: reviews.length,
    distribution
  }
}

export const createReview = async (input: CreateReviewInput): Promise<ReviewRecord> => {
  const reviews = await readReviewsFile()

  const nextReview: ReviewRecord = {
    id: `rvw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    productId: input.productId,
    author: input.author,
    rating: input.rating,
    title: input.title,
    text: input.text,
    createdAt: new Date().toISOString(),
    helpful: 0,
    status: 'approved'
  }

  reviews.unshift(nextReview)
  await writeReviewsFile(reviews)

  return nextReview
}

export const markReviewHelpful = async (reviewId: string): Promise<boolean> => {
  const reviews = await readReviewsFile()
  const next = reviews.map((review) => {
    if (review.id !== reviewId || review.status !== 'approved') return review
    return {
      ...review,
      helpful: review.helpful + 1
    }
  })

  const changed = JSON.stringify(next) !== JSON.stringify(reviews)
  if (!changed) return false

  await writeReviewsFile(next)
  return true
}

export const updateReviewStatus = async (reviewId: string, status: ReviewModerationStatus): Promise<boolean> => {
  const reviews = await readReviewsFile()
  let found = false

  const next = reviews.map((review) => {
    if (review.id !== reviewId) return review
    found = true
    return {
      ...review,
      status
    }
  })

  if (!found) return false
  await writeReviewsFile(next)
  return true
}

export const deleteReview = async (reviewId: string): Promise<boolean> => {
  const reviews = await readReviewsFile()
  const next = reviews.filter((review) => review.id !== reviewId)
  if (next.length === reviews.length) return false

  await writeReviewsFile(next)
  return true
}
