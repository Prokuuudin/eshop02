import { Prisma } from '@/generated/prisma/client'
import type { Review as PrismaReview } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'

export type ReviewModerationStatus = 'approved' | 'hidden' | 'pending'

export type AdminReply = {
  text: string
  repliedAt: string
}

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
  adminReply?: AdminReply
}

export type CreateReviewInput = {
  productId: string
  author: string
  rating: number
  title: string
  text: string
}

function mapDbToReview(row: PrismaReview): ReviewRecord {
  const status = (row.status === 'hidden' || row.status === 'pending') ? row.status : 'approved'
  return {
    id: row.id,
    productId: row.productId,
    author: row.author,
    rating: row.rating,
    title: row.title,
    text: row.text,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    helpful: row.helpful,
    status: status as ReviewModerationStatus,
    adminReply: row.adminReply ? (row.adminReply as AdminReply) : undefined,
  }
}

export const getAllReviews = async (): Promise<ReviewRecord[]> => {
  const rows = await prisma.review.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(mapDbToReview)
}

export const getProductPublicReviews = async (productId: string): Promise<ReviewRecord[]> => {
  const rows = await prisma.review.findMany({
    where: { productId, status: 'approved' },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(mapDbToReview)
}

export const getProductReviewStats = async (
  productId: string
): Promise<{ averageRating: number; count: number; distribution: Record<number, number> }> => {
  const reviews = await getProductPublicReviews(productId)
  if (!reviews.length) {
    return { averageRating: 0, count: 0, distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }
  }

  const distribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  reviews.forEach((review) => {
    const normalized = Math.max(1, Math.min(5, Math.round(review.rating)))
    distribution[normalized] += 1
  })

  const sum = reviews.reduce((acc, review) => acc + review.rating, 0)
  const averageRating = Math.round((sum / reviews.length) * 10) / 10

  return { averageRating, count: reviews.length, distribution }
}

export const createReview = async (input: CreateReviewInput): Promise<ReviewRecord> => {
  const row = await prisma.review.create({
    data: {
      id: `rvw_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
      productId: input.productId,
      author: input.author,
      rating: input.rating,
      title: input.title,
      text: input.text,
      createdAt: new Date(),
      helpful: 0,
      status: 'approved',
    },
  })
  return mapDbToReview(row)
}

export const markReviewHelpful = async (reviewId: string): Promise<boolean> => {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } })
  if (!existing || existing.status !== 'approved') return false

  await prisma.review.update({
    where: { id: reviewId },
    data: { helpful: { increment: 1 } },
  })
  return true
}

export const updateReviewStatus = async (reviewId: string, status: ReviewModerationStatus): Promise<boolean> => {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } })
  if (!existing) return false
  await prisma.review.update({ where: { id: reviewId }, data: { status } })
  return true
}

export const setAdminReply = async (reviewId: string, text: string): Promise<boolean> => {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } })
  if (!existing) return false
  await prisma.review.update({
    where: { id: reviewId },
    data: { adminReply: { text, repliedAt: new Date().toISOString() } },
  })
  return true
}

export const deleteAdminReply = async (reviewId: string): Promise<boolean> => {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } })
  if (!existing) return false
  await prisma.review.update({ where: { id: reviewId }, data: { adminReply: Prisma.DbNull } })
  return true
}

export const deleteReview = async (reviewId: string): Promise<boolean> => {
  const existing = await prisma.review.findUnique({ where: { id: reviewId } })
  if (!existing) return false
  await prisma.review.delete({ where: { id: reviewId } })
  return true
}
